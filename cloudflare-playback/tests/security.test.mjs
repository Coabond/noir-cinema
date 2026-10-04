import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let built=process.env.NOIR_TEST_WORKER;
if(!built){
 const {build}=await import('esbuild');const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'noir-security-'));built=path.join(temporary,'worker.mjs');
 await build({stdin:{contents:"export {default} from './worker.ts'; export * from './playback-security.ts';",resolveDir:root+'/src',loader:'ts'},tsconfigRaw:{},bundle:true,format:'esm',platform:'neutral',outfile:built});
 process.on('exit',()=>fs.rmSync(temporary,{recursive:true,force:true}));
}
const {default:worker,sealed,sourceURL,rangeHeader,proxySource}=await import(pathToFileURL(path.resolve(built)).href);
function setup(){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync(root+'/migrations').sort())sql.exec(fs.readFileSync(root+'/migrations/'+f,'utf8'));
 const prepare=(query)=>{let args=[];const statement={bind(...values){args=values;return statement;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){const result=sql.prepare(query).run(...args);return {meta:{changes:Number(result.changes)}};}};return statement;};
 const env={DB:{prepare,async batch(items){return Promise.all(items.map(i=>i.run()));}},FRONTEND_ORIGIN:'https://coabond.github.io',NOIR_PASSWORD:'test-only-very-long-password',SESSION_KEY:'test-only-session-key-at-least-32-chars',CREDENTIAL_KEY:btoa('a'.repeat(32))};
 const send=(route,options={})=>worker.fetch(new Request('https://private-api.example'+route,{...options,headers:{Origin:env.FRONTEND_ORIGIN,'X-Noir-Request':'1','CF-Connecting-IP':'192.0.2.1',...options.headers}}),env);
 const login=async(password=env.NOIR_PASSWORD)=>send('/auth/login',{method:'POST',body:JSON.stringify({password})});
 return {sql,env,send,login};
}
test('all library reads and writes require a private session',async()=>{
 const {send}=setup();for(const method of ['GET','POST'])assert.equal((await send('/api/library',{method,...(method==='POST'?{body:'{"action":"disconnect"}'}:{})})).status,401);
});
test('foreign origins are denied and preflight allows only configured origin',async()=>{
 const {send}=setup();assert.equal((await send('/auth/login',{method:'POST',headers:{Origin:'https://attacker.example'},body:'{}'})).status,403);
 const preflight=await send('/api/library',{method:'OPTIONS'});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://coabond.github.io');
});
test('wrong passwords are rejected and repeated attempts are limited',async()=>{
 const {login}=setup();for(let i=0;i<5;i++)assert.equal((await login('incorrect')).status,401);assert.equal((await login()).status,429);
});
test('valid login searches the whole library, rejects tampering and revokes on logout',async()=>{
 const {sql,login,send}=setup();
 const insert=sql.prepare('INSERT INTO videos(id,title,description,thumbnail,published,duration,privacy,definition,generation) VALUES(?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<30;i++)insert.run('video'+i,i===29?'Hidden needle':'Title '+i,'description','','2026-01-01',120,'private','hd','g');
 const res=await login();assert.equal(res.status,200);const {token}=await res.json();const headers={Authorization:'Bearer '+token};
 const found=await send('/api/library?q=Hidden%20needle',{headers});assert.equal(found.status,200);const data=await found.json();assert.equal(data.total,30);assert.equal(data.count,1);assert.equal(data.videos[0].id,'video29');
 assert.equal((await send('/api/library',{headers:{Authorization:'Bearer '+token.slice(0,-1)+(token.endsWith('A')?'B':'A')}})).status,401);
 assert.equal((await send('/auth/logout',{method:'POST',headers})).status,200);assert.equal((await send('/api/library',{headers})).status,401);
});
test('expired sessions and missing write header are rejected',async()=>{
 const {sql,login,send,env}=setup();const {token}=await (await login()).json();sql.exec('UPDATE sessions SET expires=0');
 assert.equal((await send('/api/library',{headers:{Authorization:'Bearer '+token}})).status,401);
 assert.equal((await worker.fetch(new Request('https://private-api.example/auth/login',{method:'POST',headers:{Origin:env.FRONTEND_ORIGIN},body:'{}'}),env)).status,403);
});
test('oversized login bodies and incomplete configuration fail closed',async()=>{
 const {send,env}=setup();assert.equal((await send('/auth/login',{method:'POST',body:'x'.repeat(4097)})).status,400);
 assert.equal((await worker.fetch(new Request('https://private-api.example/api/library'),{...env,NOIR_PASSWORD:''})).status,503);
});
test('Cloudflare credentials connect on first authorized visit and stay off responses',async()=>{
 const {send,login,env,sql}=setup();
 env.CLIENT_SECRET_JSON=JSON.stringify({installed:{client_id:'test-id',client_secret:'private-test-client-secret'}});
 env.TOKEN_JSON=JSON.stringify({client_id:'test-id',refresh_token:'private-test-refresh-token'});
 const oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{calls++;return Response.json(String(url).includes('oauth2')?{access_token:'private-test-access-token'}:{items:[{snippet:{title:'Owner channel'},contentDetails:{relatedPlaylists:{uploads:'test-uploads'}}}]});};
 try{
  assert.equal((await send('/api/library')).status,401);assert.equal(calls,0);
  const {token}=await (await login()).json();const headers={Authorization:'Bearer '+token};
  const res=await send('/api/library',{headers});assert.equal(res.status,200);const text=await res.text();const data=JSON.parse(text);
  assert.equal(data.connected,true);assert.equal(data.cloudflareConfigured,true);assert.equal(data.channel,'Owner channel');assert.equal(calls,2);
  for(const secret of ['private-test-client-secret','private-test-refresh-token','private-test-access-token'])assert.ok(!text.includes(secret));
  const stored=sql.prepare('SELECT credentials FROM settings').get().credentials;assert.ok(!stored.includes('private-test'));
  await send('/api/library',{headers});assert.equal(calls,2);
 }finally{globalThis.fetch=oldFetch;}
});
test('invalid Cloudflare secret JSON fails without revealing its contents',async()=>{
 const {send,login,env}=setup();env.CLIENT_SECRET_JSON='private-malformed-secret';env.TOKEN_JSON='{}';
 const {token}=await (await login()).json();const res=await send('/api/library',{headers:{Authorization:'Bearer '+token}});assert.equal(res.status,503);assert.ok(!(await res.text()).includes('private-malformed-secret'));
});


test('playback endpoints require authorization before any upstream requests',async()=>{
 const {send}=setup();const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
 try{for(const path of ['/playback/account','/playback/activate','/playback/poll','/playback/resolve','/playback/media/00000000-0000-0000-0000-000000000000/0'])assert.equal((await send(path,{method:path.includes('media')||path.endsWith('account')?'GET':'POST',body:path.includes('media')||path.endsWith('account')?undefined:'{}'})).status,401);assert.equal(calls,0);}finally{globalThis.fetch=old;}
});
test('playback encryption is randomized, authenticated and scoped separately from metadata',async()=>{
 const {env}=setup();const plain='private-token-and-signed-url',a=await sealed(env,plain),b=await sealed(env,plain);assert.notEqual(a,b);assert.ok(!a.includes('private-token'));assert.equal(await sealed(env,a,true),plain);
 const bytes=Buffer.from(a,'base64');bytes[20]^=1;await assert.rejects(sealed(env,bytes.toString('base64'),true));await assert.rejects(sealed({...env,CREDENTIAL_KEY:btoa('b'.repeat(32))},a,true));
});
test('media destinations and ranges reject SSRF and unsafe input',()=>{
 for(const url of ['http://rr1.googlevideo.com/videoplayback','https://googlevideo.com.evil.example/videoplayback','https://127.0.0.1/videoplayback','https://rr1.googlevideo.com:8443/videoplayback','https://x:y@rr1.googlevideo.com/videoplayback','https://www.youtube.com/watch?v=abcdefghijk','https://rr1.googlevideo.com/admin'])assert.throws(()=>sourceURL(url));
 assert.equal(sourceURL('https://rr1---sn-example.googlevideo.com/videoplayback?expire=123').protocol,'https:');assert.equal(sourceURL('https://www.youtube.com/api/timedtext?lang=en').pathname,'/api/timedtext');
 for(const range of ['bytes=-100','bytes=4-2','bytes=0-1,3-4','bytes=9007199254740993-','bytes=1-2\r\nX:bad'])assert.throws(()=>rangeHeader(range));assert.equal(rangeHeader('bytes=0-1023'),'bytes=0-1023');
});
test('range proxy streams without leaking account/session authorization and refuses hostile redirects',async()=>{
 const old=globalThis.fetch;let request;
 try{globalThis.fetch=async(url,init)=>{request=init;return new Response('part',{status:206,headers:{'Content-Range':'bytes 0-3/99','Content-Type':'video/mp4','Set-Cookie':'do-not-forward'}});};
 const res=await proxySource('https://rr1.googlevideo.com/videoplayback?expire=9999999999','bytes=0-3');assert.equal(res.status,206);assert.equal(await res.text(),'part');assert.equal(res.headers.get('Content-Range'),'bytes 0-3/99');assert.equal(res.headers.get('Set-Cookie'),null);assert.equal(request.headers.get('Authorization'),null);assert.equal(request.headers.get('Range'),'bytes=0-3');assert.equal(request.redirect,'manual');
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://attacker.example/private'}});await assert.rejects(proxySource('https://rr1.googlevideo.com/videoplayback',null));
 }finally{globalThis.fetch=old;}
});
async function playbackSession(){const state=setup();state.env.LOADER={};const {token}=await(await state.login()).json();const id=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');return {...state,id,headers:{Authorization:'Bearer '+token}};}
test('manifests and media are session-bound, expiring and revoked on lock',async()=>{
 const {env,sql,id,send,headers,login}=await playbackSession();const job='11111111-1111-1111-1111-111111111111';const payload=await sealed(env,JSON.stringify({manifest:'<MPD>protected fixture</MPD>',sources:['https://rr1.googlevideo.com/videoplayback?private-signature=fixture']}));sql.prepare('INSERT INTO playback_jobs VALUES(?,?,?,?,?,?)').run(job,id,'abcdefghijk',payload,Date.now()+60000,Date.now());
 const manifest=await send('/playback/manifest/'+job,{headers});assert.equal(manifest.status,200);assert.equal(await manifest.text(),'<MPD>protected fixture</MPD>');assert.equal(manifest.headers.get('Cache-Control'),'no-store');
 const other=await(await login()).json();assert.equal((await send('/playback/manifest/'+job,{headers:{Authorization:'Bearer '+other.token}})).status,410);
 assert.equal((await send('/playback/media/'+job+'/99',{headers})).status,404);assert.equal((await send('/playback/media/'+job+'/0',{headers:{...headers,Range:'bytes=9-3'}})).status,416);
 sql.prepare('UPDATE playback_jobs SET expires=0').run();assert.equal((await send('/playback/manifest/'+job,{headers})).status,410);
 await send('/auth/logout',{method:'POST',headers});assert.equal((await send('/playback/manifest/'+job,{headers})).status,401);
});
test('resolver cannot play arbitrary URLs or videos outside the synced library',async()=>{
 const {send,headers}=await playbackSession();for(const id of ['https://evil.example/movie','abcdefghijk']){const res=await send('/playback/resolve',{method:'POST',headers,body:JSON.stringify({id})});assert.equal(res.status,id.startsWith('https')?400:404);}
});
async function activationFixture(state){const credentials=await sealed(state.env,JSON.stringify({device_code:'private-device-code',client:{client_id:'fixture-client',client_secret:'fixture-public-client-secret'}}));state.sql.prepare('INSERT INTO playback_activation VALUES(?,?,?,?,?)').run(state.id,credentials,Date.now()+60000,0,5000);}
test('Google approval is encrypted, rate-limited and not disclosed to the browser',async()=>{
 const state=await playbackSession();await activationFixture(state);const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json({error:'authorization_pending'},{status:400});};assert.equal((await state.send('/playback/poll',{method:'POST',headers:state.headers})).status,200);await state.send('/playback/poll',{method:'POST',headers:state.headers});assert.equal(calls,1);
 state.sql.prepare('UPDATE playback_activation SET next_poll=0').run();globalThis.fetch=async()=>Response.json({access_token:'private-google-access',refresh_token:'private-google-refresh',expires_in:3600});const res=await state.send('/playback/poll',{method:'POST',headers:state.headers});assert.equal(res.status,200);assert.equal(await res.text(),'{"connected":true}');const saved=state.sql.prepare('SELECT credentials FROM playback_account').get().credentials;assert.ok(!saved.includes('private-google'));assert.equal(JSON.parse(await sealed(state.env,saved,true)).refresh_token,'private-google-refresh');
 }finally{globalThis.fetch=old;}
});
test('disconnect during approval cannot resurrect the playback account',async()=>{
 const state=await playbackSession();await activationFixture(state);const old=globalThis.fetch;
 try{globalThis.fetch=async()=>{state.sql.prepare('DELETE FROM playback_activation').run();return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600});};assert.equal((await state.send('/playback/poll',{method:'POST',headers:state.headers})).status,410);assert.equal(state.sql.prepare('SELECT COUNT(*) AS n FROM playback_account').get().n,0);}finally{globalThis.fetch=old;}
});

test('home rows use the whole library, actual view counts and recent unfinished progress',async()=>{
 const {sql,login,send}=setup();const insert=sql.prepare('INSERT INTO videos(id,title,description,thumbnail,published,duration,privacy,definition,generation,view_count) VALUES(?,?,?,?,?,?,?,?,?,?)');for(let i=0;i<30;i++)insert.run('v'+i,'Film '+i,'','','2026-01-'+String(i+1).padStart(2,'0'),120,'private','hd','g',i===0?99:i===1?50:0);sql.prepare('INSERT INTO progress VALUES(?,?,?)').run('v2',20,'2026-10-04');sql.prepare('INSERT INTO progress VALUES(?,?,?)').run('v3',120,'2026-10-05');const {token}=await(await login()).json();const response=await send('/api/library?view=home',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);const {home}=await response.json();assert.equal(home.recent[0].id,'v29');assert.equal(home.most[0].id,'v0');assert.equal(home.most.length,2);assert.equal(home.continue.length,1);assert.equal(home.continue[0].id,'v2');assert.equal(home.continue[0].position,20);
});
test('browser stream transformations are session-bound and pending streams cannot be served',async()=>{
 const {sql,env,login,send}=setup();const {token}=await(await login()).json();const headers={Authorization:'Bearer '+token};const owner=sql.prepare('SELECT id FROM sessions').get().id;const job='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';const payload={manifest:'<MPD/>',sources:['https://r1.googlevideo.com/videoplayback?n=original&expire=9999999999'],pending:true,transforms:[{index:0,n:'original'}]};sql.prepare('INSERT INTO playback_jobs VALUES(?,?,?,?,?,?)').run(job,owner,'video',await sealed(env,JSON.stringify(payload)),Date.now()+60000,Date.now());assert.equal((await send('/playback/manifest/'+job,{headers})).status,409);const second=await(await login()).json();assert.equal((await send('/playback/finalize',{method:'POST',headers:{Authorization:'Bearer '+second.token},body:JSON.stringify({job,results:[{index:0,n:'decoded'}]})})).status,410);assert.equal((await send('/playback/finalize',{method:'POST',headers,body:JSON.stringify({job,results:[{index:0,n:'enhanced_except_bad'}]})})).status,400);const done=await send('/playback/finalize',{method:'POST',headers,body:JSON.stringify({job,results:[{index:0,n:'decoded'}]})});assert.equal(done.status,200);const row=sql.prepare('SELECT payload FROM playback_jobs WHERE id=?').get(job);const saved=JSON.parse(await sealed(env,row.payload,true));assert.equal(new URL(saved.sources[0]).searchParams.get('n'),'decoded');assert.equal(saved.pending,false);assert.equal(saved.transforms,undefined);assert.equal((await send('/playback/manifest/'+job,{headers})).status,200);assert.equal((await send('/playback/finalize',{method:'POST',headers,body:JSON.stringify({job,results:[]})})).status,409);
});

test('APK requests without browser Origin retain old sessions, library and progress',async()=>{
 const {sql,env}=setup();const token='A'.repeat(43);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 sql.prepare('INSERT INTO sessions(id,expires) VALUES(?,?)').run(digest,Date.now()+3600000);
 sql.prepare('INSERT INTO videos(id,title,description,thumbnail,published,duration,privacy,definition,generation) VALUES(?,?,?,?,?,?,?,?,?)').run('abcdefghijk','APK private film','Owner upload','','2026-01-01',3600,'private','hd','g');
 const apk=(path,body)=>worker.fetch(new Request('https://private-api.example'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'X-Noir-Request':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
 const read=await apk('/api/library?q=APK&filter=private&sort=newest&offset=0');assert.equal(read.status,200);const data=await read.json();assert.equal(data.videos[0].id,'abcdefghijk');assert.equal(data.count,1);
 assert.equal((await apk('/api/library',{action:'progress',id:'abcdefghijk',seconds:120})).status,200);assert.equal((await (await apk('/api/library')).json()).videos[0].position,120);
 const connected=await apk('/playback/account');assert.equal(connected.status,200);assert.equal((await connected.json()).connected,false);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id=?').get(digest).n,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM playback_account').get().n,0);
 assert.equal((await apk('/auth/logout',{})).status,200);assert.equal((await apk('/api/library')).status,401);
});
