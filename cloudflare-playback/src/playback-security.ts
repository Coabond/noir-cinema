import type {Env} from './worker';
const text=new TextEncoder();
export async function sealed(env:Env,value:string,open=false){
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(env.CREDENTIAL_KEY),c=>c.charCodeAt(0)),'AES-GCM',false,['encrypt','decrypt']);
 const additionalData=text.encode('NOIR playback v1');
 if(open){const b=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(0,12),additionalData},key,b.slice(12)));}
 const iv=crypto.getRandomValues(new Uint8Array(12)),b=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,text.encode(value)));
 // Chunking avoids overflowing the stack for a manifest with many formats.
 let binary='';for(const chunk of [iv,b])for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));return btoa(binary);
}
export function sourceURL(value:string){
 const u=new URL(value);
 // Authenticated legacy TV responses also use YouTube's c.youtube.com CDN.
 const media=(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.googlevideo\.com$/i.test(u.hostname)||/^rr\d+---sn-[a-z0-9-]+\.c\.youtube\.com$/i.test(u.hostname))&&u.pathname==='/videoplayback';
 const captions=u.hostname==='www.youtube.com'&&u.pathname==='/api/timedtext';
 if(u.protocol!=='https:'||u.username||u.password||u.port||(!media&&!captions))throw new Error('Denied media destination');
 return u;
}
export function rangeHeader(value:string|null){
 if(value===null)return null;
 const match=/^bytes=(\d{1,16})-(\d{1,16})?$/.exec(value);
 if(!match)throw new Error('Invalid range');
 const start=Number(match[1]),end=match[2]?Number(match[2]):undefined;
 if(!Number.isSafeInteger(start)||(end!==undefined&&(!Number.isSafeInteger(end)||end<start)))throw new Error('Invalid range');return value;
}
export async function proxySource(value:string,range:string|null,head=false){
 let u=sourceURL(value);const headers=new Headers();if(range)headers.set('Range',rangeHeader(range)!);
 // Neither the NOIR session nor Google's account token is sent to a media host.
 for(let redirect=0;redirect<4;redirect++){
  const response=await fetch(u,{method:head?'HEAD':'GET',headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('Location');await response.body?.cancel();if(!location)throw new Error('Invalid redirect');u=sourceURL(new URL(location,u).href);continue;
  }
  if(![200,206,416].includes(response.status)){await response.body?.cancel();return Response.json({error:response.status===403?'The YouTube stream expired or was denied. Retry playback for a fresh stream.':'YouTube could not supply this stream.'},{status:502});}
  const out=new Headers();for(const name of ['Content-Type','Content-Length','Content-Range','Accept-Ranges']){const v=response.headers.get(name);if(v)out.set(name,v);}
  // Stream directly; never buffer a movie inside the Worker.
  return new Response(head?null:response.body,{status:response.status,headers:out});
 }
 throw new Error('Too many redirects');
}
