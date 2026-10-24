# NOIR 1.9.1 — app-only downloads (test update)

Install this APK over the existing NOIR app; do not uninstall, so your accounts and saved downloads are retained.

1. Unlock NOIR and make sure the YouTube account that owns your upload is connected.
2. Open the movie's details and press **Download offline**.
3. Choose a resolution and audio language. The app shows the selected size, or an estimated size when the server does not provide an exact size.
4. Select **SD card / folder**. In Android's folder picker, select a folder on your memory card and allow access. You can instead choose Phone memory.
5. Keep the download notification active. In NOIR's Downloads section you can pause, retry or delete the download. After it shows Ready, use **Play offline** without internet. When your online session expires, confirm your phone's existing screen lock to open Downloads.

No browser companion, exported link, IDM, desktop computer, or paid hosting is required for this native path. The memory-card folder contains the app's separate video/audio files, which NOIR plays together. Folder files can also be accessed through the phone's Files app.

The additional native streamed downloader uses the existing SABR parser in its own session; the working playback resolver and vendor player code are unchanged. It does not run a video decoder or browser renderer. Native streamed downloads restart from the beginning on retry; persistent segment-resume checkpoints are not implemented. Direct-file downloads retain their existing range-resume behavior. Captions are not included in the download; existing local-subtitle import remains available. Live, protected and unverifiable streams are rejected.

This is an experimental update. Full authenticated private-movie download and SD-card playback must still be tested on your phone. Automated tests cannot establish that every YouTube upload or every storage provider will work.
