# NOIR — GitHub Pages interface

This repository contains only the public interface and its compiled assets. No video records, thumbnails, Google credentials, session tokens, or database files are bundled here.

The private Sites backend remains responsible for authentication, YouTube metadata, full-library search, sync, and playback progress. Choose **Connect private library**, sign in in the private window if needed, then choose **Connect my cinema**. Keep that window open. Closing it or choosing **Lock library** clears the interface session. If signing in severs the connection, return to the cinema and connect again.

The connection permits only library reads, sync and progress updates. Both windows verify the exact origin, window reference, and random session channel. Credential management stays on the private site. No access token is stored on GitHub or in browser storage.

YouTube controls private playback and available quality. Use 2160p when offered; some private videos must be opened on YouTube in the owner account.

## Build

Install dependencies with `npm install`, then run `npm run build`. Publish the root of `main` with GitHub Pages. The compiled `app.js` is committed so Pages does not need a build workflow.

All project sites under coabond.github.io share one browser origin. Publish only trusted applications under this account; do not grant untrusted maintainers write access to this repository.
