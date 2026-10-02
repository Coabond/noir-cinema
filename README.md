# NOIR — private cinema on GitHub Pages

The website uses a personal NOIR password and a separate Cloudflare backend. It does not require ChatGPT login or a connection popup.

Open https://coabond.github.io/noir-cinema/ and unlock with your NOIR password. One-time setup in Cloudflare: save the complete contents of client_secret.json as the Worker secret CLIENT_SECRET_JSON and token.json as TOKEN_JSON. After login, the backend reads those secrets and initializes the connection automatically. The first sync starts automatically; no file selection or upload is required in this website. Search covers the complete synchronized library, including descriptions.

Only public interface source and built assets are stored in this repository. Never commit passwords, setup keys, Google credentials, library records or database exports. The session token is kept in browser memory and cleared on refresh, closing the page or Lock library. Lock library revokes it on the server. Sessions expire after eight hours.

YouTube independently controls private-video playback and available resolution. A library connection does not sign the embedded player into YouTube. Select 2160p when offered, or use Watch on YouTube in the upload owner's account if embedded playback is refused.

Install dependencies and run `npm run build` to rebuild app.js. GitHub Pages publishes main/root. config.js contains only the public API origin. index.html restricts connections to that origin. All sites under coabond.github.io share a browser origin; only host trusted applications under this account.

