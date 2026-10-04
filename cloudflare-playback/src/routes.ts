import {createLibrary} from './library';
import type {Env} from './worker';
export function createLibraryHandler(env:Env){
const {db,crypt,access,youtube,seconds}=createLibrary(env);

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
type Setting={credentials:string;channel:string;playlist:string;cursor:string|null;generation:string;complete:number;synced:string|null};
async function settings(){return db().prepare('SELECT * FROM settings WHERE id=1').first<Setting>();}
function cloudflareCredentials(){
 if(!env.CLIENT_SECRET_JSON&&!env.TOKEN_JSON)return null;
 if(!env.CLIENT_SECRET_JSON||!env.TOKEN_JSON)throw new Error('Add both CLIENT_SECRET_JSON and TOKEN_JSON as Cloudflare secrets.');
 let client:any,token:any;
 try{client=JSON.parse(env.CLIENT_SECRET_JSON);token=JSON.parse(env.TOKEN_JSON);}catch{throw new Error('The Cloudflare YouTube secrets must contain valid JSON.');}
 const c=client?.installed||client?.web;
 if(typeof c?.client_id!=='string'||!c.client_id||typeof c?.client_secret!=='string'||!c.client_secret||typeof token?.refresh_token!=='string'||!token.refresh_token||(token.client_id&&token.client_id!==c.client_id))throw new Error('The Cloudflare YouTube secrets must contain matching credentials and a refresh token.');
 return {client_id:c.client_id,client_secret:c.client_secret,refresh_token:token.refresh_token};
}
async function ensureCloudflareConnection(){
 const existing=await settings();if(existing)return existing;
 const credentials=cloudflareCredentials();if(!credentials)return null;
 const token=await access(credentials),ch=await youtube('channels',{part:'snippet,contentDetails',mine:'true'},token);
 const channel=ch.items?.[0];if(!channel?.contentDetails?.relatedPlaylists?.uploads)throw new Error('The Cloudflare Google connection has no YouTube uploads channel.');
 const encrypted=await crypt(JSON.stringify(credentials));
 // Concurrent first visits must never clear or replace the owner's library.
 await db().prepare('INSERT OR IGNORE INTO settings(id,credentials,channel,playlist,cursor,generation,complete,synced,lock) VALUES(1,?,?,?,?,?,0,NULL,0)').bind(encrypted,channel.snippet.title,channel.contentDetails.relatedPlaylists.uploads,null,crypto.randomUUID()).run();
 return settings();
}
async function GET(req:Request){try{
 const s=await ensureCloudflareConnection();
 const u=new URL(req.url), q=(u.searchParams.get('q')||'').slice(0,300),offset=Math.max(0,Math.min(1000000,Number(u.searchParams.get('offset'))||0)),filter=u.searchParams.get('filter'),sort=u.searchParams.get('sort');
 if(u.searchParams.get('view')==='home'){
  const select='SELECT v.*,COALESCE(p.seconds,0) AS position FROM videos v LEFT JOIN progress p ON p.id=v.id ';
  const [recent,most,continued]=await Promise.all([db().prepare(select+'ORDER BY v.published DESC,v.id LIMIT 12').all(),db().prepare(select+'WHERE v.view_count>0 ORDER BY v.view_count DESC,v.published DESC,v.id LIMIT 12').all(),db().prepare(select+'WHERE p.seconds>0 AND p.seconds<v.duration-15 ORDER BY p.updated DESC,v.id LIMIT 12').all()]);
  return json({home:{recent:recent.results,most:most.results,continue:continued.results},connected:!!s});
 }
 const pattern=q;
 const where="WHERE (instr(lower(v.title),lower(?)) > 0 OR instr(lower(v.description),lower(?)) > 0)"+(filter==='private'?" AND v.privacy='private'":filter==='continue'?' AND p.seconds>0 AND p.seconds<v.duration-15':'');
 const order=sort==='oldest'?'v.published ASC':sort==='title'?'v.title COLLATE NOCASE ASC':filter==='continue'?'p.updated DESC':'v.published DESC';
 const [list,count,total]=await Promise.all([db().prepare(`SELECT v.*,COALESCE(p.seconds,0) AS position FROM videos v LEFT JOIN progress p ON p.id=v.id ${where} ORDER BY ${order},v.id LIMIT 24 OFFSET ?`).bind(pattern,pattern,offset).all(),db().prepare(`SELECT COUNT(*) AS n FROM videos v LEFT JOIN progress p ON p.id=v.id ${where}`).bind(pattern,pattern).first<{n:number}>(),db().prepare('SELECT COUNT(*) AS n FROM videos').first<{n:number}>()]);
 return json({videos:list.results,count:count?.n||0,total:total?.n||0,connected:!!s,channel:s?.channel,complete:!!s?.complete,synced:s?.synced,cloudflareConfigured:!!env.CLIENT_SECRET_JSON&&!!env.TOKEN_JSON});
 }catch(e){return json({error:e instanceof Error?e.message:'Library unavailable'},503);}}
async function POST(req:Request){
 // The Worker validates the NOIR session before invoking this handler.
 // Restrict browser writes to the configured GitHub Pages origin.
 if(req.headers.get('X-Noir-Request')!=='1'||(req.headers.get('origin')&&req.headers.get('origin')!==env.FRONTEND_ORIGIN))return json({error:'Request denied'},403);
 try{const body=await req.json() as Record<string,any>;const database=db();
 if(body.action==='connect'){
 const c=body.client?.installed||body.client?.web;const t=body.token;
 if(!c?.client_id||!c?.client_secret||!t?.refresh_token|| (t.client_id&&t.client_id!==c.client_id))return json({error:'Choose matching client_secret.json and token.json files with a refresh token.'},400);
 const credentials={client_id:c.client_id,client_secret:c.client_secret,refresh_token:t.refresh_token};
 const token=await access(credentials),ch=await youtube('channels',{part:'snippet,contentDetails',mine:'true'},token);
 const channel=ch.items?.[0];if(!channel)throw new Error('This Google account has no YouTube channel.');
 const encrypted=await crypt(JSON.stringify(credentials));
 await database.batch([database.prepare('DELETE FROM videos'),database.prepare('DELETE FROM progress'),database.prepare('INSERT OR REPLACE INTO settings(id,credentials,channel,playlist,cursor,generation,complete,synced,lock) VALUES(1,?,?,?,?,?,0,NULL,0)').bind(encrypted,channel.snippet.title,channel.contentDetails.relatedPlaylists.uploads,null,crypto.randomUUID())]);return json({connected:true});
 }
 if(body.action==='progress'){
 if(typeof body.id!=='string'||!Number.isFinite(body.seconds))return json({error:'Invalid progress'},400);
 await database.prepare('INSERT INTO progress(id,seconds,updated) SELECT id,MIN(duration,?),? FROM videos WHERE id=? ON CONFLICT(id) DO UPDATE SET seconds=excluded.seconds,updated=excluded.updated').bind(Math.max(0,Math.floor(body.seconds)),new Date().toISOString(),body.id).run();return json({saved:true});
 }
 if(body.action==='disconnect'){await database.batch([database.prepare('DELETE FROM settings'),database.prepare('DELETE FROM videos'),database.prepare('DELETE FROM progress')]);return json({disconnected:true});}
 if(body.action!=='sync')return json({error:'Unknown action'},400);
 let s=await settings();if(!s)return json({error:'Connect your YouTube account first.'},400);
 const now=Date.now(),locked=await database.prepare('UPDATE settings SET lock=? WHERE id=1 AND lock<?').bind(now+60000,now).run();if(!locked.meta.changes)return json({error:'A sync is already running. Please wait a moment.'},409);
 try{
 if(s.complete){s={...s,cursor:null,generation:crypto.randomUUID(),complete:0};await database.prepare('UPDATE settings SET cursor=NULL,generation=?,complete=0 WHERE id=1').bind(s.generation).run();}
 const token=await access(cloudflareCredentials()||JSON.parse(await crypt(s.credentials,true)));
 const page=await youtube('playlistItems',{part:'contentDetails',playlistId:s.playlist,maxResults:'50',...(s.cursor?{pageToken:s.cursor}:{})},token);
 const ids=page.items.map((v:any)=>v.contentDetails.videoId).join(',');
 const data=ids?await youtube('videos',{part:'snippet,contentDetails,status,statistics',id:ids},token):{items:[]};
 const statements=data.items.map((v:any)=>database.prepare('INSERT INTO videos(id,title,description,thumbnail,published,duration,privacy,definition,generation,view_count) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,thumbnail=excluded.thumbnail,published=excluded.published,duration=excluded.duration,privacy=excluded.privacy,definition=excluded.definition,generation=excluded.generation,view_count=excluded.view_count').bind(v.id,v.snippet.title,v.snippet.description,(v.snippet.thumbnails.maxres||v.snippet.thumbnails.standard||v.snippet.thumbnails.high||v.snippet.thumbnails.default)?.url||'',v.snippet.publishedAt,seconds(v.contentDetails.duration),v.status.privacyStatus,v.contentDetails.definition,s!.generation,Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Number(v.statistics?.viewCount)||0))));
 if(!page.nextPageToken){statements.push(database.prepare('DELETE FROM videos WHERE generation<>?').bind(s.generation));statements.push(database.prepare('DELETE FROM progress WHERE id NOT IN(SELECT id FROM videos)'));}
 statements.push(database.prepare('UPDATE settings SET cursor=?,complete=?,synced=CASE WHEN ?=1 THEN ? ELSE synced END WHERE id=1').bind(page.nextPageToken||null,page.nextPageToken?0:1,page.nextPageToken?0:1,new Date().toISOString()));
 await database.batch(statements);return json({complete:!page.nextPageToken,processed:data.items.length});
 }finally{await database.prepare('UPDATE settings SET lock=0 WHERE id=1').run();}
 }catch(e){return json({error:e instanceof Error?e.message:'Request failed'},500);}
}


return {GET,POST};
}
