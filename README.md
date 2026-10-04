# NOIR — private cinema on GitHub Pages

The website uses a personal NOIR password and a separate Cloudflare backend. It does not require ChatGPT login or a connection popup.

Open https://coabond.github.io/noir-cinema/ and unlock with your NOIR password. One-time setup in Cloudflare: save the complete contents of client_secret.json as the Worker secret CLIENT_SECRET_JSON and token.json as TOKEN_JSON. After login, the backend reads those secrets and initializes the connection automatically. The first sync starts automatically; no file selection or upload is required in this website. Search covers the complete synchronized library, including descriptions.

Only public interface source and built assets are stored in this repository. Never commit passwords, setup keys, Google credentials, library records or database exports. The session token is kept in browser memory and cleared on refresh, closing the page or Lock library. Lock library revokes it on the server. Sessions expire after eight hours.

This draft replaces the YouTube iframe with NOIR's own Shaka-based player: quality and audio tracks, subtitles, fullscreen, picture in picture, speed, zoom, picture fit and stream details. The player engine loads only when opening a film. Available codecs and resolution depend on the upload and browser.

The new player uses the Cloudflare Free-compatible playback service in cloudflare-playback/. Its Google activation-code approval is separate from the existing library Data API connection. Google account credentials stay encrypted in Cloudflare. Player script extraction and isolated QuickJS/WebAssembly evaluation run in a temporary browser worker, which is terminated after stream preparation. No paid Worker Loader or hosting upgrade is configured.

Home includes recently uploaded videos, continuing titles from NOIR progress, and most watched by actual YouTube view counts. Sync refreshes these counts. Search scans all server candidates before ranking and pagination: whole-word title starts, other title phrase matches, all title words, then all description words. Don does not match Don't as a title word. Home clears search and filters.

Owner-account private playback is verified on the separate GitHub player preview at https://coabond.github.io/noir-cinema/player-preview/: decoded 1920 x 1080 frames, advancing playback and no HTML media error. The original homepage remains available while the new player is evaluated. This does not certify sustained 4K throughput or every browser. This candidate supports ordinary indexed DASH and captions, and rejects live/SABR-only formats. YouTube may block server requests or require additional proof tokens. Free Cloudflare request, CPU and D1 limits still apply; there is no promise of unlimited hosting or guaranteed 4K.

Install dependencies and run `npm run build` to rebuild app.js, player-engine.js and SHAKA-LICENSE. GitHub Pages publishes main/root. config.js contains only the public API origin. index.html restricts connections to that origin. All sites under coabond.github.io share a browser origin; only host trusted applications under this account.

