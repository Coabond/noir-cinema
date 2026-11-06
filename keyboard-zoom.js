export function zoomKey(event) {
  if (event.metaKey || (event.ctrlKey && event.altKey)) return null;
  const code = event.code || '';
  const number = event.keyCode || event.which;
  const keypad = /^Numpad[1-9]$/.test(code) ? code.slice(-1) : (!code && number >= 97 && number <= 105 ? String(number-96) : null);
  if (event.ctrlKey) return keypad && '24568'.includes(keypad) ? 'ctrl:'+keypad : null;
  if (event.altKey) return keypad && '1238'.includes(keypad) ? 'alt:'+keypad : null;
  if (/^(Digit|Numpad)[1-9]$/.test(code)) return code.slice(-1);
  const key = (event.key || '').toLowerCase();
  if (/^[1-9r]$/.test(key)) return key;
  if (key === '+' || key === '=' || code === 'NumpadAdd') return '+';
  if (key === '-' || code === 'NumpadSubtract') return '-';
  if (number >= 49 && number <= 57) return String(number - 48);
  return keypad;
}
export function resetZoom() { return {x:1,y:1,left:0,top:0,rotation:0,flipX:1,flipY:1}; }
export function nextZoom(previous, key, repeat=false) {
  const value = {...resetZoom(),...previous};
  const adjust = (n,delta) => Math.max(.25,Math.min(4,Math.round((n+delta)*100)/100));
  if (key === 'r') return resetZoom();
  if (key === '9' || key === '+') {value.x=adjust(value.x,.05);value.y=adjust(value.y,.05)}
  if (key === '1' || key === '-') {value.x=adjust(value.x,-.05);value.y=adjust(value.y,-.05)}
  if (key === '6') value.x=adjust(value.x,.05);
  if (key === '4') value.x=adjust(value.x,-.05);
  if (key === '8') value.y=adjust(value.y,.05);
  if (key === '2') value.y=adjust(value.y,-.05);
  if (key === 'ctrl:6') value.left=Math.min(200,value.left+2);
  if (key === 'ctrl:4') value.left=Math.max(-200,value.left-2);
  if (key === 'ctrl:8') value.top=Math.max(-200,value.top-2);
  if (key === 'ctrl:2') value.top=Math.min(200,value.top+2);
  if (key === 'ctrl:5') {value.left=0;value.top=0}
  if (key === 'alt:3') value.rotation=(value.rotation+5)%360;
  if (key === 'alt:1') value.rotation=(value.rotation-5)%360;
  if (key === 'alt:8' && !repeat) value.flipY*=-1;
  if (key === 'alt:2' && !repeat) value.flipX*=-1;
  return value;
}
export function installZoom(win, doc) {
  const states = new WeakMap();
  const handler = event => {
    const key = zoomKey(event);
    if (!key) return;
    const target = event.composedPath?.()[0] || event.target;
    if (target?.closest?.('input:not([type=range]),select,textarea,[contenteditable]:not([contenteditable=false])')) return;
    const dialog = doc.querySelector('dialog.noir-watch[open]');
    const stage = dialog?.querySelector('.noir-stage');
    const video = stage?.querySelector('video');
    if (!video) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const value = nextZoom(states.get(video),key,event.repeat);
    states.set(video,value);
    video.classList.add('noir-keyboard-zoom-video');
    for(const [name,v] of Object.entries({x:value.x*value.flipX,y:value.y*value.flipY,left:value.left+'%',top:value.top+'%',rotation:value.rotation+'deg'})) video.style.setProperty('--noir-keyboard-zoom-'+name,String(v));
    stage.setAttribute('data-keyboard-controls','hidden');
    stage.dataset.keyboardZoom = `${value.x} x ${value.y}`;
  };
  const reveal = event => {if(event.type==='pointermove'&&!event.movementX&&!event.movementY)return;event.target?.closest?.('.noir-stage')?.removeAttribute('data-keyboard-controls')};
  win.addEventListener('keydown',handler,true);
  doc.addEventListener('pointermove',reveal,true);doc.addEventListener('pointerdown',reveal,true);
  return () => {win.removeEventListener('keydown',handler,true);doc.removeEventListener('pointermove',reveal,true);doc.removeEventListener('pointerdown',reveal,true)};
}
if (typeof window !== 'undefined') installZoom(window,document);

