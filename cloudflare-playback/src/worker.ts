import {createLibraryHandler} from './routes';
import {playback} from './playback';
export interface Env {
  DB: D1Database;
  FRONTEND_ORIGIN: string;
  NOIR_PASSWORD: string;
  SESSION_KEY: string;
  CREDENTIAL_KEY: string;
  CLIENT_SECRET_JSON?: string;
  TOKEN_JSON?: string;
}
const encoder=new TextEncoder();
const json=(data:unknown,status=200)=>Response.json(data,{status});
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function hmacKey(secret:string){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function passwordMatches(input:string,env:Env){
 const key=await hmacKey(env.SESSION_KEY);
 const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(env.NOIR_PASSWORD));
 return crypto.subtle.verify('HMAC',key,signature,encoder.encode(input));
}
async function ipKey(req:Request,env:Env){
 const key=await hmacKey(env.SESSION_KEY);
 const bytes=await crypto.subtle.sign('HMAC',key,encoder.encode(req.headers.get('CF-Connecting-IP')||'unknown'));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function readBody(req:Request,limit:number){
 if(Number(req.headers.get('Content-Length'))>limit)throw new Error('body-limit');
 const reader=req.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();throw new Error('body-limit');}chunks.push(r.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return new TextDecoder().decode(bytes);
}
function secureResponse(res:Response,origin:string|null,env:Env){
 const headers=new Headers(res.headers);
 headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Vary','Origin');
 if(origin===env.FRONTEND_ORIGIN){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET, HEAD, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-Noir-Request, Range');headers.set('Access-Control-Expose-Headers','Content-Length, Content-Range, Accept-Ranges');}
 return new Response(res.body,{status:res.status,headers});
}
async function session(req:Request,env:Env){
 const bearer=req.headers.get('Authorization')||'';
 if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer))return null;
 const id=await hash(bearer.slice(7));
 const row=await env.DB.prepare('SELECT id FROM sessions WHERE id=? AND expires>?').bind(id,Date.now()).first<{id:string}>();
 return row?.id||null;
}
async function handle(req:Request,env:Env){
 const url=new URL(req.url),origin=req.headers.get('Origin');
 if(!env.FRONTEND_ORIGIN||!env.SESSION_KEY||env.SESSION_KEY.length<32||!env.NOIR_PASSWORD||env.NOIR_PASSWORD.length<16||!env.CREDENTIAL_KEY)return json({error:'Private backend setup is incomplete.'},503);
 if(origin&&origin!==env.FRONTEND_ORIGIN)return json({error:'Request denied'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204});
 if(req.method==='POST'&&req.headers.get('X-Noir-Request')!=='1')return json({error:'Request denied'},403);
 if(url.pathname==='/auth/login'&&req.method==='POST'){
  const ip=await ipKey(req,env),window=Math.floor(Date.now()/900000);
  const attempt=await env.DB.prepare('INSERT INTO login_attempts(id,window,attempts) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET window=excluded.window,attempts=CASE WHEN login_attempts.window=excluded.window THEN login_attempts.attempts+1 ELSE 1 END RETURNING attempts').bind(ip,window).first<{attempts:number}>();
  if(!attempt||attempt.attempts>5)return json({error:'Too many attempts. Please try again in 15 minutes.'},429);
  let body:{password?:unknown};try{body=JSON.parse(await readBody(req,4096));}catch{return json({error:'Invalid login request'},400);}
  if(typeof body?.password!=='string'||body.password.length>1024||!await passwordMatches(body.password,env))return json({error:'Incorrect password'},401);
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const token=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const expires=Date.now()+8*3600000;
  await env.DB.batch([
   env.DB.prepare('DELETE FROM sessions WHERE expires<=?').bind(Date.now()),
   env.DB.prepare('DELETE FROM login_attempts WHERE window<?').bind(window-1),
   env.DB.prepare('INSERT INTO sessions(id,expires) VALUES(?,?)').bind(await hash(token),expires)
  ]);
  return json({token,expires});
 }
 const id=await session(req,env);if(!id)return json({error:'Unlock your NOIR library to continue.'},401);
 if(url.pathname==='/auth/logout'&&req.method==='POST'){await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run();return json({locked:true});}
 if(url.pathname.startsWith('/playback/'))return playback(req,env,id);
 if(url.pathname!=='/api/library')return json({error:'Not found'},404);
 const route=createLibraryHandler(env);
 if(req.method==='GET')return route.GET(req);
 if(req.method==='POST'){
  let body:string;try{body=await readBody(req,65536);}catch{return json({error:'Request is too large'},413);}
  return route.POST(new Request(req.url,{method:'POST',headers:req.headers,body}));
 }
 return json({error:'Method not allowed'},405);
}
export default {
 async fetch(req:Request,env:Env){
  try{return secureResponse(await handle(req,env),req.headers.get('Origin'),env);}
  catch{return secureResponse(json({error:'The private backend is unavailable. Please try again.'},503),req.headers.get('Origin'),env);}
 }
};
