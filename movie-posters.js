import {filmIdentity,exactFilm} from './poster-matching.js?v=20261127';
const jobs=[],pending=new Map(),sources=new Map(),marked=new WeakMap();let active=0;
function pump(){while(active<2&&jobs.length){active++;jobs.shift()().finally(()=>{active--;pump();});}}
async function read(host,params){const response=await fetch(host+'/w/api.php?'+new URLSearchParams({format:'json',origin:'*',...params}),{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();return response.json();}
function titleFor(image){const tile=image.closest('button, article, .featured-carousel, .featured');return String(tile?.querySelector('h3,h2,h1')?.textContent||tile?.dataset.title||image.alt||'').replace(/\s+/g,' ').trim();}
function stored(key){try{const value=JSON.parse(localStorage.getItem('noir-public-posters-v1')||'{}')[key];return value&&Date.now()-value.time<7*86400000?value:null;}catch{return null;}}
function save(key,value){try{const data=JSON.parse(localStorage.getItem('noir-public-posters-v1')||'{}');data[key]={...value,time:Date.now()};const entries=Object.entries(data).sort((a,b)=>b[1].time-a[1].time).slice(0,1000);localStorage.setItem('noir-public-posters-v1',JSON.stringify(Object.fromEntries(entries)));}catch{}}
async function resolve(identity,source){
 const cached=stored(identity.key);if(cached)return cached;
 let entity;
 if(source){const data=await read('https://www.wikidata.org',{action:'wbgetentities',ids:source,props:'sitelinks|labels|aliases|claims|descriptions',languages:'en|hi'});entity=exactFilm(Object.values(data.entities||{}),identity);}
 if(!entity){const search=await read('https://www.wikidata.org',{action:'wbsearchentities',search:identity.title,language:'en',limit:'8'});const ids=(search.search||[]).filter(e=>/\bfilm\b/i.test(e.description||'')).map(e=>e.id).filter(id=>/^Q\d+$/.test(id));if(!ids.length){save(identity.key,{url:null});return null;}const data=await read('https://www.wikidata.org',{action:'wbgetentities',ids:ids.join('|'),props:'sitelinks|labels|aliases|claims|descriptions',languages:'en|hi'});entity=exactFilm(Object.values(data.entities||{}),identity);}
 if(!entity?.sitelinks?.enwiki?.title){save(identity.key,{url:null});return null;}
 const data=await read('https://en.wikipedia.org',{action:'query',prop:'pageimages',titles:entity.sitelinks.enwiki.title,pithumbsize:'960',pilicense:'any'});
 const page=Object.values(data.query?.pages||{})[0],url=page?.thumbnail?.source;
 const result={url:typeof url==='string'&&/^https:\/\/upload\.wikimedia\.org\//.test(url)?url:null,source:'https://en.wikipedia.org/wiki/'+encodeURIComponent(entity.sitelinks.enwiki.title)};save(identity.key,result);return result;
}
function poster(identity,source){if(pending.has(identity.key))return pending.get(identity.key);const promise=new Promise(done=>{jobs.push(async()=>{try{done(await resolve(identity,source));}catch{done(null);}});pump();});pending.set(identity.key,promise);return promise;}
function update(image){const title=titleFor(image),identity=filmIdentity(title);if(!identity.title||identity.title.length>160||marked.get(image)===title)return;marked.set(image,title);poster(identity,sources.get(title)).then(result=>{if(!result?.url||!image.isConnected||titleFor(image)!==title)return;const previous=image.getAttribute('src');image.addEventListener('error',()=>{if(image.getAttribute('src')===result.url&&previous)image.src=previous;},{once:true});image.removeAttribute('srcset');image.dataset.noirPosterSource=result.source;image.src=result.url;});}
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);update(entry.target);}},{rootMargin:'250px'});
function scan(){document.querySelectorAll('main .poster img,main .featured-art,.noir-orbit img').forEach(image=>{if(marked.get(image)!==titleFor(image))observer.observe(image);});}
window.addEventListener('noir-catalogue-artwork',event=>{for(const row of event.detail||[]){const id=String(row.source||'').match(/^https:\/\/www\.wikidata\.org\/wiki\/(Q\d+)$/)?.[1];if(id&&row.title)sources.set(String(row.title).replace(/\s+/g,' ').trim(),id);}scan();});
function start(){scan();new MutationObserver(scan).observe(document.getElementById('root')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
