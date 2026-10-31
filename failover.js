(() => {
  // work/HistorySync.mjs
  function mergeHistory(...snapshots) {
    const latest = /* @__PURE__ */ new Map();
    for (const rows of snapshots) for (const row of rows || []) {
      if (typeof row?.id !== "string" || !Number.isFinite(row.seconds) || row.seconds < 0 || !Number.isFinite(Date.parse(row.updated))) continue;
      const normalized = { id: row.id, seconds: Math.floor(row.seconds), updated: new Date(row.updated).toISOString() };
      const old = latest.get(row.id);
      if (!old || normalized.updated > old.updated || normalized.updated === old.updated && normalized.seconds === 0) latest.set(row.id, normalized);
    }
    return [...latest.values()];
  }
  function historyDelta(merged, existing) {
    const old = new Map(existing.map((row) => [row.id, row]));
    return merged.filter((row) => !old.has(row.id) || Date.parse(row.updated) > Date.parse(old.get(row.id).updated) || Date.parse(row.updated) === Date.parse(old.get(row.id).updated) && row.seconds === 0 && old.get(row.id).seconds !== 0);
  }
  async function synchronizeHistory(fetcher, servers) {
    const snapshots = await Promise.all(servers.map(async (server) => {
      const response = await fetcher(server.origin + "/api/library?view=history", { headers: { Authorization: server.auth }, credentials: "omit", signal: AbortSignal.timeout(5e3) });
      if (!response.ok) throw new Error("History server unavailable");
      const data = await response.json();
      if (data.historyVersion !== 1 || !Array.isArray(data.progress)) throw new Error("History synchronization unavailable");
      return data.progress;
    }));
    const merged = mergeHistory(...snapshots);
    for (let i = 0; i < servers.length; i++) {
      const changes = historyDelta(merged, snapshots[i]);
      for (let offset = 0; offset < changes.length; offset += 20) {
        const response = await fetcher(servers[i].origin + "/api/library", { method: "POST", headers: { Authorization: servers[i].auth, "Content-Type": "application/json", "X-Noir-Request": "1" }, body: JSON.stringify({ action: "progressBatch", progress: changes.slice(offset, offset + 20) }), credentials: "omit", signal: AbortSignal.timeout(5e3) });
        if (!response.ok) throw new Error("History update unavailable");
      }
    }
    return merged.length;
  }

  // work/noir-failover.mjs
  function isApi(path) {
    return ["/auth/login", "/auth/logout", "/api/library"].includes(path) || path.startsWith("/playback/");
  }
  function isJob(path) {
    return /^\/playback\/(media|manifest|sabr|caption|captions|finalize)(\/|$)/.test(path);
  }
  async function quotaExceeded(response) {
    if (![429, 500, 502, 503, 504].includes(response.status)) return false;
    const text = (await response.clone().text()).slice(0, 12e3);
    return /(?:error\s*(?:code[:\s]*)?1027|daily.{0,60}(?:limit|quota)|(?:limit|quota).{0,60}(?:exceeded|reached)|exceeded.{0,60}(?:limit|quota)|the private backend is unavailable)/i.test(text);
  }
  function installFailover(win) {
    const backup = "https://noir-private-api-backup.noir-private-api.workers.dev";
    const primary = "https://noir-private-api.coabondmovies.workers.dev";
    const forcedBackup = new URL(win.location.href).searchParams.get("server") === "backup";
    const native = win.fetch.bind(win), key = "noir-backup-session-v1", routeKey = "noir-backup-route-v1";
    const stores = [win.sessionStorage, win.localStorage];
    const jobs = /* @__PURE__ */ new Map();
    let activationBackend;
    let historySyncAt = 0, historySyncAuth = "", historySyncPromise;
    const pendingMirrors = /* @__PURE__ */ new Set();
    const get = (key2) => {
      for (const store of stores) {
        try {
          const v = JSON.parse(store.getItem(key2) || "null");
          if (v) return v;
        } catch {
        }
      }
      return null;
    };
    const remove = (key2) => {
      for (const store of stores) try {
        store.removeItem(key2);
      } catch {
      }
    };
    const save = (key2, value, remember) => {
      remove(key2);
      try {
        (remember ? win.localStorage : win.sessionStorage).setItem(key2, JSON.stringify(value));
      } catch {
      }
    };
    const active = () => {
      const route = get(routeKey);
      return forcedBackup || route && route.until > Date.now();
    };
    const selectBackup = () => save(routeKey, { until: Math.floor(Date.now() / 864e5) * 864e5 + 864e5 }, true);
    win.fetch = async (input, init) => {
      const req = new Request(input instanceof Request ? input.clone() : new URL(String(input), win.location.href), init);
      const url = new URL(req.url);
      if (![win.location.origin, primary, backup].includes(url.origin) || !isApi(url.pathname)) return native(input, init);
      const auth = req.headers.get("Authorization") || "";
      const pair = get(key);
      const paired = pair && pair.primary === auth && pair.expires > Date.now() && !pair.backupOnly;
      const progressTime = (/* @__PURE__ */ new Date()).toISOString();
      const publicOrigin = url.origin === backup ? win.NOIR_API_ORIGIN || win.location.origin : url.origin;
      if (paired && url.pathname === "/api/library" && req.method === "GET" && url.searchParams.get("view") === "home") {
        if (historySyncAuth !== auth || Date.now() - historySyncAt > 3e5) {
          historySyncAuth = auth;
          historySyncAt = Date.now();
          historySyncPromise = Promise.allSettled([...pendingMirrors]).then(() => synchronizeHistory(native, [{ origin: publicOrigin, auth: pair.primary }, { origin: backup, auth: pair.backup }])).catch(() => {
          });
        }
        await historySyncPromise;
      }
      const normalize = async (response2, owner) => {
        if (url.pathname === "/playback/activate" && response2.ok) activationBackend = owner;
        if (owner === "backup" && response2.status === 401) return Response.json({ error: "The backup session is unavailable. Lock and unlock NOIR once to reconnect the backup." }, { status: 409 });
        if (paired && response2.ok && url.pathname === "/api/library" && req.method === "POST") {
          try {
            const data = await req.clone().json();
            if (data.action === "progress" && typeof data.id === "string" && Number.isFinite(data.seconds)) {
              const target = owner === "backup" ? { origin: publicOrigin, auth: pair.primary } : { origin: backup, auth: pair.backup };
              const mirror = native(target.origin + "/api/library", { method: "POST", headers: { Authorization: target.auth, "Content-Type": "application/json", "X-Noir-Request": "1" }, credentials: "omit", keepalive: true, signal: AbortSignal.timeout(5e3), body: JSON.stringify({ action: "progressBatch", progress: [{ id: data.id, seconds: Math.max(0, Math.floor(data.seconds)), updated: progressTime }] }) }).catch(() => {
              });
              pendingMirrors.add(mirror);
              mirror.finally(() => pendingMirrors.delete(mirror));
            }
          } catch {
          }
        }
        const type = response2.headers.get("Content-Type") || "";
        if (!type.includes("application/json") && !type.includes("application/dash+xml")) return response2;
        let text = await response2.text();
        if (url.pathname === "/playback/resolve" && response2.ok) {
          try {
            const data = JSON.parse(text);
            if (typeof data.job === "string") jobs.set(data.job, owner);
          } catch {
          }
        }
        if (owner === "backup") text = text.replaceAll(backup + "/", publicOrigin + "/");
        const headers = new Headers(response2.headers);
        headers.delete("Content-Length");
        headers.delete("Content-Encoding");
        return new Response(text, { status: response2.status, statusText: response2.statusText, headers });
      };
      const useBackup = async () => {
        const headers = new Headers(req.headers);
        if (pair?.primary === auth && pair.expires > Date.now()) headers.set("Authorization", pair.backup);
        const response2 = await native(new Request(backup + url.pathname + url.search, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? void 0 : req.clone().body, duplex: "half", credentials: "omit", signal: req.signal }));
        return normalize(response2, "backup");
      };
      if (url.origin === backup) return useBackup();
      if (url.pathname === "/auth/login" && req.method === "POST") {
        let login;
        try {
          login = await req.clone().json();
        } catch {
          return native(req);
        }
        const backupLogin = native(new Request(backup + "/auth/login", { method: "POST", headers: req.headers, body: JSON.stringify(login), credentials: "omit", signal: AbortSignal.timeout(15e3) })).catch(() => null);
        let response2;
        try {
          response2 = await native(req.clone());
        } catch {
          response2 = null;
        }
        const other = await backupLogin;
        if (response2?.ok) {
          remove(key);
          if (other?.ok) {
            const a = await response2.clone().json(), b = await other.clone().json();
            save(key, { primary: "Bearer " + a.token, backup: "Bearer " + b.token, expires: Math.min(a.expires, b.expires) }, login.remember === true);
          }
          remove(routeKey);
          return response2;
        }
        if (other?.ok && (!response2 || await quotaExceeded(response2))) {
          const b = await other.clone().json();
          save(key, { primary: "Bearer " + b.token, backup: "Bearer " + b.token, expires: b.expires, backupOnly: true }, login.remember === true);
          selectBackup();
          return other;
        }
        if (response2) return response2;
        throw new TypeError("The NOIR login service is unavailable.");
      }
      if (url.pathname === "/auth/logout") {
        const results = await Promise.allSettled([native(req.clone()), useBackup()]);
        remove(key);
        remove(routeKey);
        const result = results.find((r) => r.status === "fulfilled" && r.value.ok);
        if (result) return result.value;
        if (results[0].status === "fulfilled") return results[0].value;
        throw new TypeError("The NOIR service is unavailable.");
      }
      if (isJob(url.pathname)) {
        let id = url.pathname.split("/")[3];
        if (url.pathname === "/playback/finalize") {
          try {
            id = (await req.clone().json()).job;
          } catch {
          }
        }
        if (jobs.get(id) === "backup") return useBackup();
        if (!jobs.has(id)) return Response.json({ error: "Playback preparation expired. Retry playback." }, { status: 409 });
        const response2 = await native(req);
        if (await quotaExceeded(response2)) selectBackup();
        return normalize(response2, "primary");
      }
      if (url.pathname === "/playback/poll" && activationBackend) return activationBackend === "backup" ? useBackup() : normalize(await native(req), "primary");
      if (active() || pair?.backupOnly && pair.primary === auth && pair.expires > Date.now()) return useBackup();
      const response = await native(req.clone());
      if (await quotaExceeded(response)) {
        selectBackup();
        if (["GET", "HEAD"].includes(req.method) || url.pathname === "/playback/resolve") return useBackup();
      }
      return normalize(response, "primary");
    };
  }
  if (typeof window !== "undefined") installFailover(window);
})();

