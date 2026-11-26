(()=>{
const fetcher=window.fetch.bind(window),origins=new Set([location.origin,'https://noir-private-api.coabondmovies.workers.dev','https://noir-private-api-backup.noir-private-api.workers.dev']);
let template=null,running=false,controller=null,lastAttempt=0,timer=null,note=null,worker=null,detailController=null;
const titles=new Map(),details=new Map();
function status(text){const main=document.querySelector('main');if(!main)return;if(!note||!note.isConnected){note=document.createElement('p');note.className='catalogue-progress';note.setAttribute('role','status');main.querySelector('.collection-status')?.append(note);}note.textContent=text;}
function allowed(request){try{const u=new URL(request.url);return origins.has(u.origin)&&u.pathname==='/api/library'&&request.headers.has('Authorization');}catch{return false;}}
async function request(view,body){if(!template)throw Error('Library is locked');const headers=new Headers(template.headers);if(body){headers.set('Content-Type','application/json');headers.set('X-Noir-Request','1');}return fetcher(template.origin+'/api/library'+(view?'?view='+view:''),{method:body?'POST':'GET',headers,credentials:'omit',signal:controller.signal,...(body?{body:JSON.stringify(body)}:{})});}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(!document.querySelector('dialog[open]'))void updateRatings();},5000);}
function rememberRows(data){const rows=[...(data.videos||[]),...Object.values(data.home||{}).flat()];for(const row of rows)if(typeof row?.title==='string'&&/^[-\w]{11}$/.test(row.id)){titles.set(row.title.trim(),row.id);if(String(row.description||'').includes('NOIR CATALOGUE DETAILS'))details.set(row.id,row.description);}while(titles.size>10000)titles.delete(titles.keys().next().value);}
window.fetch=async(input,init)=>{
 let url;try{url=new URL(input instanceof Request?input.url:String(input),location.href);}catch{return fetcher(input,init);}
 // Playback requests pass through unchanged, without cloning their bodies.
 if(!origins.has(url.origin)||!['/api/library','/auth/logout'].includes(url.pathname))return fetcher(input,init);
 let req;try{req=new Request(input instanceof Request?input.clone():url,init);}catch{return fetcher(input,init);}
 if(url.pathname==='/auth/logout'){template=null;controller?.abort();detailController?.abort();worker?.terminate();clearTimeout(timer);titles.clear();details.clear();}
 const response=await fetcher(input,init);
 if(allowed(req)&&response.ok){template={origin:url.origin,headers:new Headers({Authorization:req.headers.get('Authorization')})};
  if(req.method==='GET'&&!['imdbRatings','catalogue'].includes(url.searchParams.get('view')))response.clone().json().then(data=>{rememberRows(data);showDetails();}).catch(()=>{});
  if(req.method==='POST')try{const body=await req.clone().json();if(body.action==='searchIndex')response.clone().json().then(data=>{if(data.complete)schedule();}).catch(()=>{});}catch{}
 }
 return response;
};
function sourceLinks(){for(const parent of document.querySelectorAll('.noir-film-notes,.noir-details-panel')){if(parent.querySelector('.noir-catalogue-links'))continue;const text=parent.querySelector('p')?.textContent||'';if(!text.includes('NOIR CATALOGUE DETAILS'))continue;const imdb=text.match(/https:\/\/www\.imdb\.com\/title\/tt\d{5,12}\//)?.[0],wikidata=text.match(/https:\/\/www\.wikidata\.org\/wiki\/Q\d+/)?.[0];const nav=document.createElement('div');nav.className='noir-catalogue-links';for(const [url,label]of [[imdb,'View on IMDb'],[wikidata,'Public catalogue source']])if(url){const link=document.createElement('a');link.href=url;link.textContent=label;link.target='_blank';link.rel='noopener noreferrer';nav.append(link);}parent.append(nav);}}
function paintDetails(id){const text=details.get(id);if(!text)return;for(const p of document.querySelectorAll('dialog[open] .noir-film-notes .description,dialog[open] .noir-details-panel p'))if(p.textContent!==text)p.textContent=text;sourceLinks();}
function showDetails(){const dialog=document.querySelector('dialog[open]');if(!dialog){detailController?.abort();detailController=null;return;}const title=dialog.querySelector('h2')?.textContent?.trim(),id=titles.get(title);if(!id||!template)return;paintDetails(id);if(dialog.dataset.noirCatalogue===id)return;dialog.dataset.noirCatalogue=id;detailController?.abort();detailController=new AbortController();const current=detailController;const url=new URL('/api/library',template.origin);url.searchParams.set('view','movieDetails');url.searchParams.set('id',id);fetcher(url.href,{headers:new Headers(template.headers),credentials:'omit',signal:current.signal}).then(async response=>{if(!response.ok)return;const data=await response.json();if(data.video?.id===id&&data.video.title===title&&String(data.video.description||'').includes('NOIR CATALOGUE DETAILS')){details.set(id,data.video.description);if(dialog.isConnected&&!current.signal.aborted)paintDetails(id);}}).catch(()=>{});}
async function updateRatings(){
 if(running||!template||document.hidden||document.querySelector('dialog[open]')||Date.now()-lastAttempt<86400000)return;
 if(typeof DecompressionStream==='undefined'||typeof Worker==='undefined')return;
 running=true;controller=new AbortController();let reader;
 try{
 const catalogue=await request('catalogue');if(!catalogue.ok)throw Error();const meta=await catalogue.json();
 if(!Array.isArray(meta.imdbIds)||!meta.imdbIds.length||!meta.needsRatings)return;
 const data=await request('imdbRatings');if(!data.ok||!data.body)throw Error();lastAttempt=Date.now();status('Updating IMDb ratings from the official free dataset…');
 worker=new Worker(new URL('./imdb-rating-worker.js?v=20261127',document.baseURI),{type:'module'});let serial=0;
 const call=(kind,payload={})=>new Promise((resolve,reject)=>{const number=++serial;const timeout=setTimeout(()=>{cleanup();reject(Error('Dataset worker timed out'));},20000);const cleanup=()=>{clearTimeout(timeout);worker?.removeEventListener('message',receive);controller.signal.removeEventListener('abort',abort);};const abort=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};const receive=event=>{if(event.data.serial===number){cleanup();event.data.error?reject(Error(event.data.error)):resolve(event.data);}};worker.addEventListener('message',receive);controller.signal.addEventListener('abort',abort,{once:true});worker.postMessage({serial:number,kind,...payload});});
 await call('start',{ids:meta.imdbIds});reader=data.body.pipeThrough(new DecompressionStream('gzip')).getReader();const decoder=new TextDecoder();
 while(true){const part=await reader.read();if(part.done)break;const result=await call('chunk',{text:decoder.decode(part.value,{stream:true})});if(result.done){await reader.cancel();break;}}
 const result=await call('finish');for(let offset=0;offset<result.rows.length;offset+=100){const saved=await request('',{action:'imdbRatings',items:result.rows.slice(offset,offset+100)});if(!saved.ok)throw Error();}
 const completed=await request('',{action:'imdbImportComplete'});if(!completed.ok)throw Error();status('NOIR catalogue · IMDb ratings updated for '+result.rows.length+' matched titles. Refresh to see new details.');
 }catch(error){if(error.name==='AbortError'){lastAttempt=0;status('Catalogue update paused while playing.');}else{lastAttempt=Date.now()-23*3600000;status('IMDb update paused. Existing descriptions remain available.');}}
 finally{try{await reader?.cancel();}catch{}worker?.terminate();worker=null;running=false;}
}
function observe(){let debounce;new MutationObserver(()=>{if(!document.querySelector('main .search input')){template=null;controller?.abort();detailController?.abort();titles.clear();details.clear();}if(running&&document.querySelector('dialog[open]'))controller?.abort();clearTimeout(debounce);debounce=setTimeout(()=>{showDetails();sourceLinks();},150);}).observe(document.getElementById('root')||document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
window.addEventListener('pagehide',()=>{controller?.abort();detailController?.abort();worker?.terminate();});
})();
