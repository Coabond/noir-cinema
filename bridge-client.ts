import {libraryCache} from './LibraryCache';
declare global {interface Window {NOIR_API_ORIGIN?:string}}
export const BACKEND=(window.NOIR_API_ORIGIN||'').replace(/\/$/,'');
let token='';let deadline=0;let onLock=()=>{};
const sessionKey='noir.remembered-session.v1';
function forgetSaved(){try{localStorage.removeItem(sessionKey);}catch{}}
export function restoreLibrary(){
 try{const value=localStorage.getItem(sessionKey);if(!value){libraryCache.clear();return false;}const saved=JSON.parse(value);
 if(saved.backend!==BACKEND||!(/^[A-Za-z0-9_-]{43}$/).test(saved.token)||!Number.isFinite(saved.expires)||saved.expires<=Date.now()||saved.expires>Date.now()+31*86400000){forgetSaved();libraryCache.clear();return false;}
 token=saved.token;deadline=saved.expires;libraryCache.start(BACKEND,token,deadline,true);return true;
 }catch{forgetSaved();libraryCache.clear();return false;}
}
export function setLockHandler(handler:()=>void){onLock=handler;}
function apiURL(path:string){
 if(!BACKEND||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(BACKEND))throw new Error('The private backend is not connected yet.');
 return BACKEND+path;
}
export async function unlockLibrary(password:string,remember=false){
 const res=await window.fetch(apiURL('/auth/login'),{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-Noir-Request':'1'},body:JSON.stringify({password,remember})});
 const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to unlock your library.');
 if(typeof data.token!=='string'||!(/^[A-Za-z0-9_-]{43}$/).test(data.token)||!Number.isFinite(data.expires)||data.expires<=Date.now())throw new Error('Invalid login response.');
 token=data.token;deadline=data.expires;forgetSaved();
 libraryCache.clear();libraryCache.start(BACKEND,token,deadline,remember);
 if(remember)try{localStorage.setItem(sessionKey,JSON.stringify({backend:BACKEND,token,expires:deadline}));}catch{ /* This session remains usable when storage is blocked. */ }
}
export function lockLibrary(){
 const old=token;token='';deadline=0;forgetSaved();libraryCache.clear();onLock();
 if(old)window.fetch(apiURL('/auth/logout'),{method:'POST',credentials:'omit',keepalive:true,headers:{Authorization:'Bearer '+old,'X-Noir-Request':'1'}}).catch(()=>{});
}
window.addEventListener('storage',event=>{if(event.key===sessionKey){token='';deadline=0;libraryCache.clear();onLock();}});
let retryAfter=0;
function cachedMode(){libraryCache.offline=true;retryAfter=Date.now()+60000;window.dispatchEvent(new CustomEvent('noir-cache-status',{detail:'Saved library mode · Cloudflare or the connection is unavailable. Saved titles and descriptions remain searchable; new actor lookups and private playback still need the service.'}));}
export function retryLibraryConnection(){retryAfter=0;}
function onlineMode(){if(libraryCache.offline){libraryCache.offline=false;window.dispatchEvent(new CustomEvent('noir-cache-status',{detail:''}));}}
async function cachedResponse(url:string){const data=await libraryCache.fallback(url);return data?Response.json(data,{headers:{'X-Noir-Cache':'saved'}}):null;}
export async function libraryFetch(url:string,init:RequestInit={}){
 if(!token||Date.now()>=deadline){lockLibrary();throw new Error('Unlock your NOIR library to continue.');}
 const parsed=new URL(url,location.origin);if(parsed.pathname!=='/api/library'&&!parsed.pathname.startsWith('/playback/'))throw new Error('Unsupported request.');
 const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+token);
 const requestToken=token;
 const library=parsed.pathname==='/api/library',get=(!init.method||init.method==='GET')&&library;
 if(init.signal?.aborted)throw new DOMException('Cancelled','AbortError');
 let progress:any;try{if(library&&init.method==='POST'&&typeof init.body==='string'){const body=JSON.parse(init.body);if(body.action==='progress'&&typeof body.id==='string'&&Number.isFinite(body.seconds)){progress=body;await libraryCache.progress(body.id,body.seconds);}}}catch{}
 if(libraryCache.offline&&Date.now()<retryAfter&&library){if(progress)return Response.json({savedLocally:true}, {status:202});if(get){const saved=await cachedResponse(url);if(saved)return saved;}else return Response.json({error:'Cloudflare is unavailable. Your saved library is kept. Use Refresh to check the connection before syncing again.'},{status:503});}
 let result:Response;
 try{result=await window.fetch(apiURL(parsed.pathname+parsed.search),{...init,headers,credentials:'omit'});}catch(e){if(init.signal?.aborted||!token)throw e;if(library){cachedMode();if(progress)return Response.json({savedLocally:true},{status:202});if(get){const saved=await cachedResponse(url);if(saved)return saved;}}throw e;}
 if(requestToken!==token||!token||Date.now()>=deadline)throw new DOMException('Session ended','AbortError');
 if(result.status===401){lockLibrary();return result;}
 if(library&&(result.status===429||result.status>=500)){cachedMode();if(progress)return Response.json({savedLocally:true},{status:202});if(get){const saved=await cachedResponse(url);if(saved)return saved;}}
 if(get&&result.ok){onlineMode();try{await libraryCache.remember(url,await result.clone().json());}catch{}}
 return result;
}
let saving=false;
export async function saveLibraryForLater(meta:any,signal:AbortSignal,onProgress:(text:string)=>void){
 if(saving||libraryCache.offline||!meta.complete||await libraryCache.fresh(meta))return;
 saving=true;try{const videos:any[]=[];for(let offset=0;offset<Math.max(meta.total,1);offset+=24){
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  const r=await libraryFetch('/api/library?'+new URLSearchParams({q:'',filter:'all',sort:'newest',offset:String(offset)}),{signal});
  const data=await r.json();if(!r.ok||data._cached)throw Error('Saving paused. Previously saved titles are still available.');
  if(data.total!==meta.total||data.synced!==meta.synced||!Array.isArray(data.videos)||(offset<meta.total&&!data.videos.length))throw Error('Library changed while saving. Refresh to save the latest version.');
  videos.push(...data.videos);if(videos.length>10000)throw Error('Visited pages are saved; the full collection exceeds this device’s cache limit.');
  onProgress('Saving library on this device · '+Math.min(videos.length,meta.total)+' / '+meta.total);
 }
 if(new Set(videos.map(v=>v.id)).size!==meta.total)throw Error('Library changed while saving. Refresh to save the latest version.');
 if(signal.aborted)throw new DOMException('Cancelled','AbortError');await libraryCache.snapshot(meta,videos);onProgress('Saved library ready on this device · '+videos.length+' videos');
 }catch(e){if(!signal.aborted)onProgress((e as Error).message);}finally{saving=false;}
}
export function authorizePlayback(urls:string[],headers:Record<string,string>){
 if(!token||Date.now()>=deadline){lockLibrary();throw new Error('Unlock NOIR to continue.');}
 if(!urls.length||urls.some(value=>{const u=new URL(value);return u.origin!==BACKEND||!/^\/playback\/(manifest|media|sabr)\//.test(u.pathname);}))throw new Error('Unexpected playback destination.');
 headers.Authorization='Bearer '+token;
}
export async function playbackRequest(path:string,body?:unknown,signal?:AbortSignal){
 const r=await libraryFetch('/playback/'+path,{method:body===undefined?'GET':'POST',signal,...(body===undefined?{}:{headers:{'Content-Type':'application/json','X-Noir-Request':'1'},body:JSON.stringify(body)})});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'Playback could not connect.');return data;
}
