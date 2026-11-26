(() => {
  const states = new WeakMap(), catalogue = new Map(), cache = new Map();
  let active = 0; const queue = [];
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const relevant = image => image instanceof HTMLImageElement && image.matches('main .poster img, main .featured-art, .noir-orbit img');
  function titleFor(image) {
    const tile = image.closest('button, article, .featured-carousel, .featured');
    return clean(tile?.querySelector('h3,h2,h1')?.textContent || tile?.dataset.title || image.alt || 'Your private cinema');
  }
  function cover(title) {
    const lines = []; let line = '';
    for (const word of title.split(' ')) { if ((line+' '+word).trim().length > 32 && line) { lines.push(line); line = word; } else line=(line+' '+word).trim(); if(lines.length===3)break; }
    if(lines.length<4&&line)lines.push(line);
    const hue=[...title].reduce((n,c)=>(n*31+c.charCodeAt(0))%360,0);
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue},40%,24%)"/><stop offset="1" stop-color="#101114"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><circle cx="830" cy="80" r="250" fill="#fff" opacity=".04"/><text x="64" y="95" fill="#e8bf80" font-family="sans-serif" font-size="24" letter-spacing="7">NOIR CINEMA</text>${lines.map((t,i)=>`<text x="64" y="${220+i*56}" fill="#fff" font-family="sans-serif" font-size="42">${escape(t)}</text>`).join('')}<path d="M68 448h90" stroke="#e8bf80" stroke-width="4"/></svg>`);
  }
  function pump(){while(active<2&&queue.length){const job=queue.shift();active++;job().finally(()=>{active--;pump();});}}
  function publicImage(id){
    if(cache.has(id))return cache.get(id);
    const task=new Promise(resolve=>{queue.push(async()=>{try{
      const response=await fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+id+'&props=claims&format=json&origin=*',{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error();const data=await response.json();
      const claim=(data.entities?.[id]?.claims?.P18||[]).find(c=>c.rank!=='deprecated'&&typeof c.mainsnak?.datavalue?.value==='string');
      const filename=claim?.mainsnak.datavalue.value;
      resolve(filename?'https://commons.wikimedia.org/wiki/Special:Redirect/file/'+encodeURIComponent(filename)+'?width=960':null);
    }catch{resolve(null);}});pump();});cache.set(id,task);return task;
  }
  function tryCatalogue(image,state){
    const id=catalogue.get(state.title);if(!id||state.catalogueAttempt)return;
    state.catalogueAttempt=true;publicImage(id).then(url=>{if(!url||!image.isConnected||states.get(image)!==state||state.title!==titleFor(image))return;state.current=url;state.done=true;image.src=url;});
  }
  function fallback(image){
    if(!relevant(image))return;
    const src=image.getAttribute('src')||'',title=titleFor(image);let state=states.get(image);
    if(!state||state.current!==src||state.title!==title){const id=src.match(/\/(?:vi|vi_webp)\/([\w-]{11})\//)?.[1];state={current:src,title,urls:id?['hqdefault.jpg','mqdefault.jpg'].map(n=>'https://i.ytimg.com/vi/'+id+'/'+n).filter(u=>u!==src):[],done:false};states.set(image,state);}
    if(state.done){if(!src.startsWith('data:')){state.current=cover(title);image.src=state.current;}return;}
    const next=state.urls.shift()||cover(title);state.done=next.startsWith('data:');state.current=next;
    image.removeAttribute('srcset');image.style.removeProperty('visibility');image.src=next;
    if(state.done)tryCatalogue(image,state);
  }
  document.addEventListener('error',event=>fallback(event.target),true);
  document.addEventListener('load',event=>{const image=event.target;if(!relevant(image))return;image.style.removeProperty('visibility');if(!image.src.startsWith('data:')&&image.naturalWidth<=120&&image.naturalHeight<=90)fallback(image);},true);
  function scan(){document.querySelectorAll('main .poster img, main .featured-art, .noir-orbit img').forEach(image=>{if(!image.getAttribute('src')||(image.complete&&!image.naturalWidth))fallback(image);else {const state=states.get(image);if(state?.done)tryCatalogue(image,state);}});}
  window.addEventListener('noir-catalogue-artwork',event=>{for(const row of event.detail||[]){const id=String(row.source||'').match(/^https:\/\/www\.wikidata\.org\/wiki\/(Q\d+)$/)?.[1];if(id&&row.title)catalogue.set(clean(row.title),id);}scan();});
  function start(){scan();new MutationObserver(scan).observe(document.getElementById('root')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
