export const normalize=(value:string)=>String(value||'').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').toLowerCase().replace(/[‘’]/g,"'").replace(/[^\p{L}\p{M}\p{N}']+/gu,' ').trim().replace(/ +/g,' ');
const words=(value:string)=>normalize(value).split(' ').filter(Boolean);
function prefix(word:string,query:string){return word===query||(!word.includes("'")&&!query.includes("'")&&word.startsWith(query));}
function all(text:string,q:string,partial=false){const hay=words(text);return words(q).every(w=>hay.some(v=>partial?prefix(v,w):v===w));}
export function editDistance(a:string,b:string,limit=2){
 if(Math.abs(a.length-b.length)>limit)return limit+1;
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));if(Math.min(...next)>limit)return limit+1;previous=next;}
 return previous[b.length];
}
export function searchRank(title:string,description:string,query:string,cast='',aliases=''){
 const q=normalize(query),t=normalize(title);if(!q)return -1;
 if(t===q||t.startsWith(q+' '))return 0;
 if((' '+t+' ').includes(' '+q+' '))return 1;
 if(all(t,q))return 2;
 const qw=words(q),tw=words(t);
 if(qw.every((w,i)=>tw[i]&&prefix(tw[i],w)))return 3;
 if(all(t,q,true))return 4;
 if(aliases&&all(aliases,q,true))return 5;
 if(cast&&all(cast,q,true))return 6;
 if(all(description,q))return 7;
 if(all(description,q,true))return 8;
 if(qw.length<=4&&qw.every(w=>w.length>=4)&&qw.every(w=>tw.some(v=>!v.includes("'")&&editDistance(v,w,w.length>=8?2:1)<=(w.length>=8?2:1))))return 9;
 return -1;
}
export function movieIdentity(uploadTitle:string){
 const yearMatch=uploadTitle.match(/(?:\(|\[|\b)((?:19|20)\d{2})(?:\)|\]|\b)/);
 let title=(yearMatch?uploadTitle.slice(0,yearMatch.index):uploadTitle).replace(/\[[^\]]*\]/g,' ').replace(/\b(?:WEB[ .-]?DL|WEB[ .-]?RIP|HDRIP|BDRIP|BLURAY|DVDRIP|REMUX|2160P|1080P|720P|4K|FULL MOVIE)\b.*$/i,'').trim();
 title=title.replace(/[-_|: ]+$/,'').trim();
 return {title,year:yearMatch?Number(yearMatch[1]):0,key:normalize(title)+'|'+(yearMatch?yearMatch[1]:'')};
}
