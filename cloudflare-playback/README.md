# NOIR browser playback service — Free-compatible candidate

Extends the existing password/library Cloudflare Worker. No Worker Loader, subscription or paid CPU setting is configured. GitHub Pages serves the HTML5/Shaka player and a temporary browser worker that extracts the current public YouTube player script and evaluates its transformation function inside a QuickJS WebAssembly VM without host functions or credentials. Heavy extraction runs on the user's device.

## Deployment

1. Keep existing Worker secrets and the DB binding. Apply migrations 0003_playback.sql and 0004_home_rows.sql to the existing database; earlier migrations describe the already installed schema and should not be repeated. The new view_count field starts at zero until the next sync. Back up the database or use D1 recovery before manual migration.
2. Deploy this Worker with its current Free plan and test authenticated library reads first. The API origin is unchanged and existing APK library/progress calls are retained.
3. Open a staging frontend, unlock with the existing NOIR password and use Connect YouTube. Approve Google's activation code in the upload-owning channel. NOIR stores the separate playback connection encrypted in D1, never GitHub or local storage.
4. Test a real private upload, seek, captions, available audio and quality, reconnection and Lock. Publish the frontend only after private playback succeeds. The browser implementation does not run Android's SmartTube player binary.

## Security

Playback routes require an expiring, revocable NOIR session. Account tokens, approval challenges and stream jobs are encrypted with authenticated AES-GCM. A preparation job is bound to the requesting session and cannot serve manifests or media until finalization. The browser receives only transformation inputs, never Google account tokens. Finalization accepts transformed n/signature strings for existing job sources; it cannot supply an arbitrary media URL. All Google media destinations and redirects are validated and account/session tokens are stripped from proxy requests. Streams are forwarded without buffering a complete movie.

The public script is processed in QuickJS with no network, DOM, filesystem or owner credentials. Evaluation has memory, stack and interrupt limits, and a parent worker timeout. CSP permits WebAssembly compilation but does not permit general JavaScript unsafe-eval. Scripts and Wasm assets are local to GitHub Pages. VM/module assets load only during playback preparation and the worker is terminated afterward.

## Limits and validation

Free Cloudflare CPU/request/storage limits apply. Existing accounts can have unused free allowances, but 4K streaming may exceed them. YouTube can restrict data-center requests and change its unofficial protocol. This implementation supports ordinary indexed DASH formats and captions; live, OTF and SABR-only results are rejected. A real private owner-account/browser playback test is still pending.

19 backend tests cover sessions, origins, encryption, approval races, signed stream proxying, home-row ordering, and session-bound browser finalization. Three frontend tests cover full-library ranking, pagination and cancellation. Browser checks use current public YouTube player code and synthetic inputs; they are not a private-video playback test. The Shaka controls are exercised with an official public demonstration stream.

Upstream: https://github.com/LuanRT/YouTube.js (MIT), https://github.com/justjake/quickjs-emscripten (MIT), https://github.com/shaka-project/shaka-player (Apache-2.0). Root includes their required licenses. Authentication: https://ytjs.dev/guide/authentication .

## Current staging status

Worker version 4bf3384c is deployed after owner approval; version d3863426 remains available for rollback. D1 migrations 0003/0004 are already applied and must not be repeated on this production database. Current secrets and DB binding were preserved. The original GitHub homepage is unchanged; https://coabond.github.io/noir-cinema/player-preview/ contains the new player for owner testing. Production auth/CORS checks passed. An additional compatibility test covers the APK's requests without a browser Origin, pre-existing sessions, library search, progress and logout. APK streams and its saved YouTube account stay on-device and do not use the website playback connection. Actual owner-account web playback remains pending.
