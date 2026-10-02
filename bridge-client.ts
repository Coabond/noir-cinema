declare global {interface Window {NOIR_API_ORIGIN?:string}}
export const BACKEND=(window.NOIR_API_ORIGIN||'').replace(/\/$/,'');
let token='';let deadline=0;let onLock=()=>{};
export function setLockHandler(handler:()=>void){onLock=handler;}
function apiURL(path:string){
 if(!BACKEND||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(BACKEND))throw new Error('The private backend is not connected yet.');
 return BACKEND+path;
}
export async function unlockLibrary(password:string){
 const res=await window.fetch(apiURL('/auth/login'),{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-Noir-Request':'1'},body:JSON.stringify({password})});
 const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to unlock your library.');
 if(typeof data.token!=='string'||typeof data.expires!=='number')throw new Error('Invalid login response.');
 token=data.token;deadline=data.expires;
}
export function lockLibrary(){
 const old=token;token='';deadline=0;onLock();
 if(old)window.fetch(apiURL('/auth/logout'),{method:'POST',credentials:'omit',keepalive:true,headers:{Authorization:'Bearer '+old,'X-Noir-Request':'1'}}).catch(()=>{});
}
window.addEventListener('pagehide',lockLibrary);
export async function libraryFetch(url:string,init:RequestInit={}){
 if(!token||Date.now()>=deadline){lockLibrary();throw new Error('Unlock your NOIR library to continue.');}
 const parsed=new URL(url,location.origin);if(parsed.pathname!=='/api/library')throw new Error('Unsupported request.');
 const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+token);
 const result=await window.fetch(apiURL(parsed.pathname+parsed.search),{...init,headers,credentials:'omit'});
 if(result.status===401)lockLibrary();
 return result;
}
