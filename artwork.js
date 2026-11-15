function isArtwork(image) {
  return image instanceof HTMLImageElement &&
    image.matches('main .poster img, main .featured-art');
}

document.addEventListener('error', (event) => {
  if (isArtwork(event.target)) event.target.style.visibility = 'hidden';
}, true);

document.addEventListener('load', (event) => {
  if (isArtwork(event.target)) event.target.style.removeProperty('visibility');
}, true);

