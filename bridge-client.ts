export const BACKEND = 'https://noir-private-cinema.coabondmovies1.chatgpt.site';
let popup: Window | null = null;
let channel = '';
let ready = false;
let poll: ReturnType<typeof setInterval> | undefined;
const pending = new Map<string,{resolve:(r:Response)=>void;reject:(e:Error)=>void;cleanup:()=>void}>();
let onState: (state:string)=>void = () => {};
function reset(reason='locked') {
  ready=false; clearInterval(poll);
  for (const item of pending.values()) {item.cleanup();item.reject(new Error('Reconnect to your private library.'));}
  pending.clear(); onState(reason);
}
export function lockLibrary() {popup?.close();popup=null;reset();}
export function connectLibrary(update:(state:string)=>void) {
  lockLibrary(); onState=update; channel=crypto.randomUUID();
  popup=window.open(BACKEND+'/pages-connect#'+channel,'noir-'+channel,'popup,width=540,height=610');
  if (!popup) {onState('blocked');return;}
  onState('connecting');const started=Date.now();
  poll=setInterval(()=>{
    if(!popup||popup.closed){reset();return;}
    if(!ready && Date.now()-started>120000){reset('timeout');return;}
    popup.postMessage({protocol:'noir-pages-v1',type:'hello',channel},BACKEND);
  },1000);
}
window.addEventListener('message',event=>{
  if(event.origin!==BACKEND || event.source!==popup || !popup || event.data?.channel!==channel || event.data?.protocol!=='noir-pages-v1')return;
  if(event.data.type==='ready'){ready=true;onState('ready');return;}
  if(event.data.type==='expired'){reset('expired');return;}
  if(event.data.type!=='response')return;
  const item=pending.get(event.data.id);if(!item)return;
  pending.delete(event.data.id);item.cleanup();
  item.resolve(new Response(JSON.stringify(event.data.data),{status:event.data.status,headers:{'Content-Type':'application/json'}}));
});
window.addEventListener('pagehide',()=>popup?.close());
export function libraryFetch(url:string,init:RequestInit={}):Promise<Response>{
  if(!ready||!popup||popup.closed)return Promise.reject(new Error('Reconnect to your private library.'));
  if(init.signal?.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
  const parsed=new URL(url,location.origin);if(parsed.pathname!=='/api/library')return Promise.reject(new Error('Unsupported request.'));
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const cancel=()=>{pending.delete(id);cleanup();reject(new DOMException('Cancelled','AbortError'));};
    const timer=setTimeout(()=>{pending.delete(id);cleanup();reject(new Error('The connection timed out. Try again.'));},65000);
    const cleanup=()=>{clearTimeout(timer);init.signal?.removeEventListener('abort',cancel);};
    pending.set(id,{resolve,reject,cleanup});init.signal?.addEventListener('abort',cancel,{once:true});
    popup!.postMessage({protocol:'noir-pages-v1',type:'request',channel,id,method:init.method||'GET',query:Object.fromEntries(parsed.searchParams),body:init.body?JSON.parse(String(init.body)):undefined},BACKEND);
  });
}
