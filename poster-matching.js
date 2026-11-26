// Resolve public film identities before displaying their title artwork.
export const normalized = value => String(value||'').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim().replace(/ +/g,' ');
export function filmIdentity(upload){
 const raw=String(upload||'');const year=[...raw.matchAll(/(?:^|[^\p{L}\p{N}])((?:19|20)\d{2})(?=$|[^\p{L}\p{N}])/gu)].find(m=>normalized(raw.slice(0,m.index)).length);
 let title=(year?raw.slice(0,year.index):raw).replace(/\[[^\]]*\]/g,' ').replace(/\b(?:WEB[ ._-]?DL|WEB[ ._-]?RIP|HDRIP|BDRIP|BLURAY|DVDRIP|REMUX|2160P|1080P|720P|4K|FULL MOVIE|SEASON)\b.*$/i,'').replace(/\b(?:3D|2D|FULL SBS|HALF SBS|SBS|HSBS|OU)\b/gi,' ').replace(/_+/g,' ').replace(/[—–()|:\-\s]+$/g,'').trim().replace(/ +/g,' ');
 return {title,year:year?Number(year[1]):0,key:normalized(title)+'|'+(year?year[1]:'')};
}
export function exactFilm(entities,identity){
 const matches=entities.filter(e=>{
  const film=/\bfilm\b/i.test(e.descriptions?.en?.value||'')||(e.claims?.P31||[]).some(c=>['Q11424','Q24869'].includes(c.mainsnak?.datavalue?.value?.id));
  const labels=[e.labels?.en?.value,e.labels?.hi?.value,...(e.aliases?.en||[]).map(a=>a.value),...(e.aliases?.hi||[]).map(a=>a.value)];
  const years=(e.claims?.P577||[]).filter(c=>c.rank!=='deprecated').map(c=>Number(String(c.mainsnak?.datavalue?.value?.time||'').slice(1,5)));
  return film&&labels.some(t=>t&&normalized(t)===normalized(identity.title))&&(!identity.year||years.includes(identity.year));
 });return matches.length===1?matches[0]:null;
}
