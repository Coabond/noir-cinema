# NOIR Browser Companion 1.0 / Android 1.9

This is an experimental, explicit browser-media handoff, not a guarantee that every YouTube video is downloadable. The existing native YouTube player, account connection and TV player are unchanged. There is no Cloudflare dependency for captured media transfers or completed offline playback.

## Desktop Chrome / Brave / Edge
1. Extract NOIR-Browser-Companion-1.0-Chromium.zip into a permanent folder.
2. Open the browser's Extensions page, enable Developer mode, then Load unpacked and select that folder (the folder containing manifest.json).
3. Open your own video on YouTube and sign in normally in that browser.
4. After any ads, open the companion and click Capture this YouTube tab. Play the film. Change YouTube's quality/audio setting if you want another track to be captured. Reopen the popup and Refresh tracks.
5. Choose a video track and, unless it already contains audio, an audio track. Sizes are the selected full files' declared sizes. Quality labels are mapped from known format IDs; unknown IDs are labelled explicitly.
6. Export for NOIR Android creates a small JSON handoff file. Transfer it privately to the phone. In the updated NOIR app, open Downloads, confirm your phone lock if required, and choose Import browser handoff (or Paste handoff for the JSON text). Confirm title/size, then phone memory or SD folder. Completed files play in Downloads without internet.
7. Alternatively Save selected tracks on this computer starts browser downloads. Adaptive video and audio remain separate files; this companion does not merge them or add a desktop offline player.
8. Clear private links when finished. Delete exported handoff files after importing. They contain private expiring media URLs, although no account cookies/passwords are exported.

## Android browsers
The APK's file/JSON import works independently of the installed browser. You can capture on a desktop and import the handoff on Android, preferably on the same network. Google Chrome for Android cannot load this extension. NOIR cannot inspect Chrome's signed-in session.

A Firefox-compatible variant is supplied as source ZIP for development/testing with Firefox for Android. It is NOT Mozilla-signed and cannot be installed as an ordinary add-on in Firefox stable. Temporary installation requires Mozilla's developer workflow (web-ext run --target=firefox-android with Android debugging). Permanent easy installation requires Mozilla signing/distribution, which has not been performed. Other Android extension browsers vary; no specific mobile browser capture has been verified on a physical device. Do not assume a desktop ZIP installs on Android Chrome.

## Limits and privacy
Capture is off until explicitly enabled for one YouTube watch tab. It observes successful direct-media GET responses on googlevideo.com. It does not read browser cookies, login forms, passwords, request bodies, or Authorization headers. Signed links are kept in browser session storage (memory fallback), capped at 50 tracks. Navigating to a different video or closing the tab clears its capture; Clear private links clears immediately. The extension asks for tabs permission to associate requests with the selected watch page. No captured data is sent to NOIR's server or any new third party.

Some captured tracks can belong to ads or other activity within the selected tab. Enable capture after ads and explicitly choose tracks for the film; association is by selected tab, not a validated media identity. Downloads are not claimed successful until the downloader verifies the full response and file sizes. Streaming-only SABR/POST, live segments, blobs, missing full-file sizes and encrypted/protected formats are not handled. Direct URLs may still be bound to browser cookies or network/IP, or expire; those downloads fail rather than importing cookies or bypassing protection. A copied YouTube watch URL alone is not a downloadable media URL.

APK links stay only in process memory, never in the offline catalogue. Pause/resume works while those links remain in memory; after process restart, expiration or rejection re-import a fresh matching handoff. Import finds a matching unfinished browser download (same video/format/size) and offers to resume it. Ready downloads retain no stream links. One transfer runs at a time with a 64 KB buffer, no background browser renderer or decoder; Android 8 minimum remains unchanged. Files in a chosen SD folder are accessible to the phone's Files app.

## Validation
Automated URL/size/type/expiry/segment/audio validation and downloader regression checks are included. An authenticated end-to-end private-video capture on your browser and phone has not been performed. This is a test build until that succeeds.

References:
- https://developer.chrome.com/docs/extensions/reference/api/webRequest
- https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/
- https://developers.google.com/identity/siwg/best-practices
