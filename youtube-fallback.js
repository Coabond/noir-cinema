// Use YouTube's supported player when the custom player has no clear media to play.
// No NOIR tokens, Google JSON files, or server credentials are passed to the frame.
export function youtubeVideoId(value) {
  try { const u = new URL(value); const id = u.searchParams.get('v');
    return u.protocol === 'https:' && u.hostname === 'www.youtube.com' && u.pathname === '/watch' && /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
export function needsYouTubePlayer(message) {
  // This function is only used for the custom player's error alert, never its
  // loading/paused status or the library's authentication messages.
  return typeof message === 'string' && message.trim().length > 0;
}
export function updateFallbacks(document) {
  for (const dialog of document.querySelectorAll('dialog.noir-watch')) {
    const stage = dialog.querySelector('.noir-stage');
    if (!stage) continue;
    const alert = stage.querySelector('[role="alert"]');
    const link = stage.querySelector('a[href^="https://www.youtube.com/watch?"]');
    const id = youtubeVideoId(link?.href);
    const old = stage.querySelector('.noir-youtube-fallback');
    if (!id || !needsYouTubePlayer(alert?.textContent)) {
      if (old) old.remove();
      stage.classList.remove('youtube-fallback-active');
      continue;
    }
    if (old?.dataset.videoId === id) continue;
    old?.remove();
    const box = document.createElement('section');
    box.className = 'noir-youtube-fallback'; box.dataset.videoId = id;
    box.setAttribute('aria-label', 'YouTube playback');
    const header = document.createElement('div'); header.className = 'noir-youtube-header';
    const text = document.createElement('span'); text.textContent = 'YouTube player · Use the account that owns this upload';
    const open = document.createElement('a'); open.href = 'https://www.youtube.com/watch?v=' + id;
    open.textContent = 'Open in YouTube'; open.target = '_blank'; open.rel = 'noopener noreferrer';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label','Close YouTube player');
    close.addEventListener('click', () => dialog.querySelector('[aria-label="Close player"]')?.click());
    header.append(text, open, close);
    const iframe = document.createElement('iframe');
    iframe.title = 'YouTube — ' + (dialog.querySelector('h2')?.textContent || 'Private video');
    iframe.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0';
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true; iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    box.append(header, iframe); stage.append(box); stage.classList.add('youtube-fallback-active');
    stage.querySelector('video')?.pause();
  }
}
if (typeof document !== 'undefined') {
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return; queued = true;
    queueMicrotask(() => { queued = false; updateFallbacks(document); });
  });
  observer.observe(document.body, {childList:true,subtree:true,characterData:true});
  updateFallbacks(document);
}

