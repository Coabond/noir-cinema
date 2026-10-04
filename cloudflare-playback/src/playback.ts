import type {Env} from './worker';
import {sealed,proxySource,rangeHeader,sourceURL} from './playback-security';
import {createYouTube,makeManifest,publicPlayer,type SavedAccount,type TransformRequest} from './youtube-playback';
const json=(value:unknown,status=200)=>Response.json(value,{status});
type Activation={device_code:string;client:{client_id:string;client_secret:string}};
type Job={manifest:string;sources:string[];pending?:boolean;transforms?:TransformRequest[]};
async function body(req:Request,limit=1024){if(Number(req.headers.get('Content-Length'))>limit)throw new Error('Body too large');const reader=req.body?.getReader();let s='';if(reader){const decoder=new TextDecoder();for(;;){const r=await reader.read();if(r.done)break;s+=decoder.decode(r.value,{stream:true});if(s.length>limit){await reader.cancel();throw new Error('Body too large');}}}return JSON.parse(s||'{}');}
export async function playback(req:Request,env:Env,sessionId:string){
 const path=new URL(req.url).pathname,now=Date.now();
 if(path==='/playback/account'&&req.method==='GET'){
  const account=await env.DB.prepare('SELECT id FROM playback_account WHERE id=1').first();return json({connected:!!account,available:true});
 }
 if(path==='/playback/disconnect'&&req.method==='POST'){
  await env.DB.batch([env.DB.prepare('DELETE FROM playback_account'),env.DB.prepare('DELETE FROM playback_activation'),env.DB.prepare('DELETE FROM playback_jobs')]);return json({connected:false});
 }
 if(path==='/playback/player'&&req.method==='GET'){
  try{return json(await publicPlayer());}catch{return json({error:'YouTube player code is unavailable. Retry shortly.'},502);}
 }
 if(path==='/playback/finalize'&&req.method==='POST'){
  let data:any;try{data=await body(req,65536);}catch{return json({error:'Invalid stream transformation.'},400);}
  if(typeof data.job!=='string'||!Array.isArray(data.results)||data.results.length>150)return json({error:'Invalid stream transformation.'},400);
  const row=await env.DB.prepare('SELECT payload FROM playback_jobs WHERE id=? AND session_id=? AND expires>?').bind(data.job,sessionId,now).first<{payload:string}>();
  if(!row?.payload)return json({error:'Playback expired. Retry.'},410);
  const job=JSON.parse(await sealed(env,row.payload,true)) as Job;if(!job.pending)return json({error:'Stream already finalized.'},409);
  const expected=job.transforms||[];if(data.results.length!==expected.length)return json({error:'Incomplete stream transformation.'},400);
  try{const seen=new Set<number>();for(const item of expected){const result=data.results.find((r:any)=>r.index===item.index);if(!result||seen.has(result.index))throw new Error();seen.add(result.index);const url=new URL(job.sources[item.index]);
   if(item.n){if(typeof result.n!=='string'||!result.n||result.n.length>8192||result.n.startsWith('enhanced_except_'))throw new Error();url.searchParams.set('n',result.n);}
   if(item.sig){if(typeof result.sig!=='string'||!result.sig||result.sig.length>8192)throw new Error();if(!/^[a-zA-Z0-9_-]{1,40}$/.test(item.sp||'signature'))throw new Error();url.searchParams.set(item.sp||'signature',result.sig);}
   job.sources[item.index]=sourceURL(url.href).href;
  }}catch{return json({error:'YouTube stream transformation failed. Retry.'},400);}
  job.pending=false;delete job.transforms;
  const changed=await env.DB.prepare('UPDATE playback_jobs SET payload=? WHERE id=? AND session_id=? AND expires>?').bind(await sealed(env,JSON.stringify(job)),data.job,sessionId,Date.now()).run();if(!changed.meta.changes)return json({error:'Playback expired. Retry.'},410);
  return json({manifest:new URL('/playback/manifest/'+data.job,req.url).href});
 }
 if(path==='/playback/activate'&&req.method==='POST'){
  const existing=await env.DB.prepare('SELECT next_poll FROM playback_activation WHERE session_id=? AND expires>?').bind(sessionId,now).first<{next_poll:number}>();
  if(existing&&existing.next_poll>now)return json({error:'Please wait a few seconds before requesting a new code.'},429);
  // Reserve before contacting YouTube, including when its request fails.
  await env.DB.prepare('INSERT INTO playback_activation(session_id,credentials,expires,next_poll,interval_ms) VALUES(?,?,?, ?,5000) ON CONFLICT(session_id) DO UPDATE SET credentials=excluded.credentials,expires=excluded.expires,next_poll=excluded.next_poll,interval_ms=5000').bind(sessionId,'',now+30000,now+15000).run();
  try{
   const yt=await createYouTube(env);const client=await yt.session.oauth.getClientID();yt.session.oauth.client_id=client;
   const code=await yt.session.oauth.getDeviceAndUserCode();
   if(!code.device_code||!code.user_code||!Number.isFinite(code.expires_in)||code.expires_in<=0)throw new Error('No activation code');
   const link=new URL(code.verification_url);if(link.protocol!=='https:'||!['www.google.com','google.com','accounts.google.com','www.youtube.com','youtube.com'].includes(link.hostname))throw new Error('Invalid approval link');
   const expires=now+Math.min(code.expires_in,1800)*1000,interval=Math.max(5000,Math.min(code.interval*1000||5000,30000));
   await env.DB.prepare('UPDATE playback_activation SET credentials=?,expires=?,next_poll=?,interval_ms=? WHERE session_id=?').bind(await sealed(env,JSON.stringify({device_code:code.device_code,client})),expires,Date.now()+interval,interval,sessionId).run();
   return json({code:code.user_code,url:link.href,expires,interval});
  }catch{return json({error:'YouTube could not issue an activation code. Try again shortly.'},502);}
 }
 if(path==='/playback/poll'&&req.method==='POST'){
  const row=await env.DB.prepare('SELECT credentials,expires,next_poll,interval_ms FROM playback_activation WHERE session_id=?').bind(sessionId).first<{credentials:string;expires:number;next_poll:number;interval_ms:number}>();
  if(!row||row.expires<=now||!row.credentials)return json({error:'Request a fresh YouTube activation code.'},410);
  if(row.next_poll>now)return json({pending:true,interval:row.next_poll-now});
  const claimed=await env.DB.prepare('UPDATE playback_activation SET next_poll=? WHERE session_id=? AND next_poll=?').bind(now+row.interval_ms,sessionId,row.next_poll).run();
  if(!claimed.meta.changes)return json({pending:true,interval:row.interval_ms});
  const saved=JSON.parse(await sealed(env,row.credentials,true)) as Activation;
  const response=await fetch('https://www.youtube.com/o/oauth2/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...saved.client,code:saved.device_code,grant_type:'http://oauth.net/grant_type/device/1.0'}),signal:AbortSignal.timeout(20000)});
  const token=await response.json() as any;
  if(token.error==='authorization_pending'||token.error==='slow_down'){
   const interval=Math.min(60000,row.interval_ms+(token.error==='slow_down'?5000:0));await env.DB.prepare('UPDATE playback_activation SET interval_ms=?,next_poll=? WHERE session_id=?').bind(interval,Date.now()+interval,sessionId).run();return json({pending:true,interval});
  }
  if(!response.ok||typeof token.access_token!=='string'||typeof token.refresh_token!=='string'||!Number.isFinite(token.expires_in)||token.expires_in<=0){await env.DB.prepare('DELETE FROM playback_activation WHERE session_id=?').bind(sessionId).run();return json({error:'YouTube approval expired or was denied. Request a new code.'},410);}
  // A logout during Google's response must not complete the approval.
  const account:SavedAccount={access_token:token.access_token,refresh_token:token.refresh_token,expiry_date:new Date(Date.now()+token.expires_in*1000).toISOString(),client:saved.client};
  const stored=await env.DB.prepare('INSERT INTO playback_account(id,credentials,updated) SELECT 1,?,? WHERE EXISTS(SELECT id FROM sessions WHERE id=? AND expires>?) AND EXISTS(SELECT session_id FROM playback_activation WHERE session_id=? AND credentials=? AND expires>?) ON CONFLICT(id) DO UPDATE SET credentials=excluded.credentials,updated=excluded.updated RETURNING id').bind(await sealed(env,JSON.stringify(account)),Date.now(),sessionId,Date.now(),sessionId,row.credentials,Date.now()).first();
  if(!stored)return json({error:'The approval was cancelled or NOIR was locked. Request a new code.'},410);
  await env.DB.batch([env.DB.prepare('DELETE FROM playback_activation'),env.DB.prepare('DELETE FROM playback_jobs')]);return json({connected:true});
 }
 if(path==='/playback/resolve'&&req.method==='POST'){
  let videoId:unknown,playerInfo:any;try{const data=await body(req);videoId=data.id;playerInfo=data.player;}catch{return json({error:'Invalid video request.'},400);}
  if(typeof videoId!=='string'||!/^[-\w]{11}$/.test(videoId))return json({error:'Invalid video.'},400);
  if(!await env.DB.prepare('SELECT id FROM videos WHERE id=?').bind(videoId).first())return json({error:'Video is not in your library.'},404);
  if(!playerInfo||! /^[a-zA-Z0-9_-]{6,32}$/.test(playerInfo.id)||!Number.isSafeInteger(playerInfo.timestamp)||playerInfo.timestamp<10000||playerInfo.timestamp>100000)return json({error:'Refresh the YouTube player.'},400);
  const account=await env.DB.prepare('SELECT credentials FROM playback_account WHERE id=1').first<{credentials:string}>();if(!account)return json({error:'Connect the YouTube account that owns this upload.',connect:true},409);
  const latest=await env.DB.prepare('SELECT created FROM playback_jobs WHERE session_id=? ORDER BY created DESC LIMIT 1').bind(sessionId).first<{created:number}>();if(latest&&latest.created>now-5000)return json({error:'Wait a few seconds and retry playback.'},429);
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO playback_jobs(id,session_id,video_id,payload,expires,created) VALUES(?,?,?,?,?,?)').bind(id,sessionId,videoId,'',now+60000,now).run();
  try{
   const credentials=JSON.parse(await sealed(env,account.credentials,true)) as SavedAccount;
   const persist=async(tokens:SavedAccount)=>{await env.DB.prepare('UPDATE playback_account SET credentials=?,updated=? WHERE id=1 AND credentials=?').bind(await sealed(env,JSON.stringify(tokens)),Date.now(),account.credentials).run();};
   const result=await makeManifest(env,credentials,videoId,new URL('/playback/media/'+id,req.url).href,persist,playerInfo);
   const owner=await env.DB.prepare('SELECT expires FROM sessions WHERE id=? AND expires>?').bind(sessionId,Date.now()).first<{expires:number}>();
   if(!owner)return json({error:'Unlock NOIR to continue.'},401);
   const signedExpiries=result.sources.map(u=>Number(new URL(u).searchParams.get('expire'))*1000).filter(n=>Number.isFinite(n)&&n>0);
   const expires=Math.min(owner.expires,Date.now()+4*3600000,...signedExpiries.map(n=>n-60000));
   if(expires<Date.now()+60000)throw new Error('Stream expired');
   await env.DB.prepare('UPDATE playback_jobs SET payload=?,expires=? WHERE id=?').bind(await sealed(env,JSON.stringify(result)),expires,id).run();
   await env.DB.prepare('DELETE FROM playback_jobs WHERE expires<=? OR (session_id=? AND id NOT IN (SELECT id FROM playback_jobs WHERE session_id=? ORDER BY created DESC LIMIT 3))').bind(Date.now(),sessionId,sessionId).run();
   return json({job:id,transforms:result.transforms,expires});
  }catch{return json({error:'YouTube did not provide playable adaptive streams. Use the account that owns this upload. YouTube may also restrict server playback; reconnect or retry.'},502);}
 }
 const match=/^\/playback\/(manifest|media)\/([0-9a-f-]{36})(?:\/(\d{1,3}))?$/.exec(path);
 if(match&&(req.method==='GET'||req.method==='HEAD')){
  const row=await env.DB.prepare('SELECT payload FROM playback_jobs WHERE id=? AND session_id=? AND expires>?').bind(match[2],sessionId,now).first<{payload:string}>();if(!row?.payload)return json({error:'Playback expired. Retry for a fresh stream.'},410);
  const job=JSON.parse(await sealed(env,row.payload,true)) as Job;
  if(job.pending)return json({error:'Finish preparing this stream first.'},409);
  if(match[1]==='manifest'&&!match[3])return new Response(req.method==='HEAD'?null:job.manifest,{headers:{'Content-Type':'application/dash+xml'}});
  if(match[1]!=='media'||match[3]===undefined||!job.sources[Number(match[3])])return json({error:'Not found'},404);
  let range:string|null;try{range=rangeHeader(req.headers.get('Range'));}catch{return json({error:'Invalid range.'},416);}
  try{return await proxySource(job.sources[Number(match[3])],range,req.method==='HEAD');}catch{return json({error:'The stream could not be reached. Retry playback.'},502);}
 }
 return json({error:'Not found'},404);
}
