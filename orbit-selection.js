export function movieTileKey(title){return String(title).split(/\s*[—–]\s*(?:season|ep\b|part\b|4k|8k|1080p|720p|hindi|english|tamil|telugu|malayalam|kannada)/i)[0].replace(/\b(?:WEB[- .]?DL|WEB[- .]?RIP|HDRIP|BLURAY|2160P|1080P|720P|4K|8K)\b.*$/i,'').replace(/\[[^\]]*\]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
export function chooseMovieTiles(pool,count,previous=[],random=Math.random){
 const unique=new Map();for(const item of pool){const key=movieTileKey(item.title);if(key&&!unique.has(key))unique.set(key,item);}
 const current=new Set(previous.map(item=>movieTileKey(item.title)));
 const fresh=[...unique.values()].filter(item=>!current.has(movieTileKey(item.title)));
 const candidates=fresh.length>=count?fresh:[...unique.values()];
 for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
 const result=candidates.slice(0,count);
 if(result.length>1)for(let i=0;i<result.length;i++)if(previous[i]&&movieTileKey(result[i].title)===movieTileKey(previous[i].title)){const j=(i+1)%result.length;[result[i],result[j]]=[result[j],result[i]];}
 return result;
}