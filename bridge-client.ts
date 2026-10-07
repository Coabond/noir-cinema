declare global {interface Window {NOIR_API_ORIGIN?:string}}
export const BACKEND=(window.NOIR_API_ORIGIN||'').replace(/\/$/,'');
let token='';let deadline=0;let onLock=()=>{};
const sessionKey='noir.remembered-session.v1';
function forgetSaved(){try{localStorage.removeItem(sessionKey);}catch{}}
export function restoreLibrary(){
 try{const value=localStorage.getItem(sessionKey);if(!value)return false;const saved=JSON.parse(value);
 if(saved.backend!==BACKEND||!(/^[A-Za-z0-9_-]{43}$/).test(saved.token)||!Number.isFinite(saved.expires)||saved.expires<=Date.now()||saved.expires>Date.now()+31*86400000){forgetSaved();return false;}
 token=saved.token;deadline=saved.expires;return true;
 }catch{forgetSaved();return false;}
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
 if(remember)try{localStorage.setItem(sessionKey,JSON.stringify({backend:BACKEND,token,expires:deadline}));}catch{ /* This session remains usable when storage is blocked. */ }
}
export function lockLibrary(){
 const old=token;token='';deadline=0;forgetSaved();onLock();
 if(old)window.fetch(apiURL('/auth/logout'),{method:'POST',credentials:'omit',keepalive:true,headers:{Authorization:'Bearer '+old,'X-Noir-Request':'1'}}).catch(()=>{});
}
window.addEventListener('storage',event=>{if(event.key===sessionKey&&event.newValue===null){token='';deadline=0;onLock();}});
export async function libraryFetch(url:string,init:RequestInit={}){
 if(!token||Date.now()>=deadline){lockLibrary();throw new Error('Unlock your NOIR library to continue.');}
 const parsed=new URL(url,location.origin);if(parsed.pathname!=='/api/library'&&!parsed.pathname.startsWith('/playback/'))throw new Error('Unsupported request.');
 const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+token);
 const result=await window.fetch(apiURL(parsed.pathname+parsed.search),{...init,headers,credentials:'omit'});
 if(result.status===401)lockLibrary();
 return result;
}
export function authorizePlayback(urls:string[],headers:Record<string,string>){
 if(!token||Date.now()>=deadline){lockLibrary();throw new Error('Unlock NOIR to continue.');}
 if(!urls.length||urls.some(value=>{const u=new URL(value);return u.origin!==BACKEND||!/^\/playback\/(manifest|media)\//.test(u.pathname);}))throw new Error('Unexpected playback destination.');
 headers.Authorization='Bearer '+token;
}
export async function playbackRequest(path:string,body?:unknown,signal?:AbortSignal){
 const r=await libraryFetch('/playback/'+path,{method:body===undefined?'GET':'POST',signal,...(body===undefined?{}:{headers:{'Content-Type':'application/json','X-Noir-Request':'1'},body:JSON.stringify(body)})});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'Playback could not connect.');return data;
}
