import type {Env} from './worker';
export function createLibrary(env:Env){

function db(){if(!env.DB)throw new Error('Library storage is unavailable. Please try again.');return env.DB;}
type Credentials={client_id:string;client_secret:string;refresh_token:string};
async function crypt(value:string,decrypt=false){
 const secret=(env as unknown as Record<string,string>).CREDENTIAL_KEY;
 if(!secret)throw new Error('Secure connection storage is not configured.');
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(secret),c=>c.charCodeAt(0)), 'AES-GCM',false,['encrypt','decrypt']);
 if(decrypt){const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,bytes.slice(12)));}
 const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));return btoa(String.fromCharCode(...iv,...encrypted));
}
async function access(c:Credentials){
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({...c,grant_type:'refresh_token'})});
 const j=await r.json() as {access_token?:string};if(!r.ok||!j.access_token)throw new Error('Google authorization expired or was revoked. Reconnect with a fresh token.json.');return j.access_token;
}
async function youtube(path:string,params:Record<string,string>,token:string){
 const r=await fetch('https://www.googleapis.com/youtube/v3/'+path+'?'+new URLSearchParams(params),{headers:{Authorization:'Bearer '+token}});
 if(!r.ok){if(r.status===403)throw new Error('YouTube denied this request. Check API access and daily quota, then retry.');throw new Error('YouTube could not load your library. Please retry.');}return r.json() as Promise<any>;
}
function seconds(iso:string){const m=iso.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);return m?Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0):0;}


return {db,crypt,access,youtube,seconds};
}
