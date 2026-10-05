import {normalize,searchRank} from './SearchCore.ts';
export {normalize,searchRank} from './SearchCore.ts';
export async function rankedLibrary(query:string,filter:string,sort:string,offset:number,signal:AbortSignal,fetcher:(url:string,init?:RequestInit)=>Promise<Response>){
 const read=async(q:string,page:number)=>{const r=await fetcher('/api/library?'+new URLSearchParams({q,filter,sort,offset:String(page)}),{signal});const data=await r.json();if(!r.ok)throw new Error(data.error||'Library unavailable');return data;};
 if(!query.trim())return read('',offset);const smart=await fetcher('/api/library?'+new URLSearchParams({q:query,filter,sort,offset:String(offset),search:'smart'}),{signal});const smartData=await smart.json();if(!smart.ok)throw new Error(smartData.error||'Search unavailable');if(smartData.searchVersion===2)return smartData;const word=normalize(query).split(' ')[0].split("'")[0];const candidate=/^[a-z0-9]+$/.test(word)?word:'';
 let matched=0,base:any,order=0;const best:{video:any;rank:number;order:number}[]=[];const limit=offset+24;
 for(let page=0;;page+=24){if(signal.aborted)throw new DOMException('Cancelled','AbortError');const data=await read(candidate,page);base=data;for(const video of data.videos){const rank=searchRank(video.title,video.description,query);if(rank>=0){matched++;best.push({video,rank,order:order++});} }best.sort((a,b)=>a.rank-b.rank||a.order-b.order);if(best.length>limit)best.length=limit;if(page+24>=data.count)break;if(!data.videos.length||page>=1_000_000)throw new Error('The search could not finish. Retry after syncing.');}
 return {...base,count:matched,videos:best.slice(offset,offset+24).map(row=>row.video)};
}
