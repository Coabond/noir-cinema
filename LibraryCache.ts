import {searchRank} from './SearchCore';
const KEY='noir.library-cache.v1';
const encoder=new TextEncoder();
const MAX_BYTES=2_000_000;
type Entry={at:number;data:any};
type Bundle={pages:Record<string,Entry>;snapshot?:Entry;progress:Record<string,number>};
const blank=():Bundle=>({pages:{},progress:{}});
function row(v:any){return Object.fromEntries(['id','title','description','thumbnail','published','duration','privacy','definition','position','view_count'].map(k=>[k,v[k]]));}
function clean(data:any){
 const result:any=Object.fromEntries(['count','total','connected','complete','channel','synced','cloudflareConfigured','searchVersion'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
 if(Array.isArray(data.videos))result.videos=data.videos.map(row);
 if(data.home)result.home=Object.fromEntries(['recent','most','continue'].map(k=>[k,(data.home[k]||[]).map(row)]));
 return result;
}
const keyOf=(url:string)=>{const u=new URL(url,'https://noir.invalid');u.searchParams.sort();return u.pathname+'?'+u.searchParams.toString();};
const base64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
const bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export class LibraryCache {
 private bundle=blank();private version=0;private key?:CryptoKey;private expires=0;private persistent=false;private ready=Promise.resolve();private writer=Promise.resolve();
 offline=false;
 start(backend:string,token:string,expires:number,persistent:boolean){
  const version=++this.version;this.bundle=blank();this.key=undefined;this.expires=expires;this.persistent=persistent;this.offline=false;
  this.ready=(async()=>{try{
   const digest=await crypto.subtle.digest('SHA-256',encoder.encode('NOIR library cache v1\n'+backend+'\n'+token));
   const key=await crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt','decrypt']);
   if(version!==this.version)return;this.key=key;
   if(!persistent)return;const saved=localStorage.getItem(KEY);if(!saved)return;
   const box=JSON.parse(saved);if(box.expires!==expires||expires<=Date.now())throw Error('Expired cache');
   const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(box.iv)},key,bytes(box.data));
   const bundle=JSON.parse(new TextDecoder().decode(decoded));
   if(version===this.version&&bundle.pages&&bundle.progress)this.bundle=bundle;
  }catch{if(version===this.version)try{localStorage.removeItem(KEY);}catch{}}})();
 }
 clear(){this.version++;this.bundle=blank();this.key=undefined;this.expires=0;this.offline=false;try{localStorage.removeItem(KEY);}catch{}}
 private valid(){return this.expires>Date.now();}
 private persist(){
  const version=this.version;
  this.writer=this.writer.catch(()=>{}).then(async()=>{await this.ready;if(version!==this.version||!this.persistent||!this.key||!this.valid())return;
   let serialized=encoder.encode(JSON.stringify(this.bundle));
   while(serialized.byteLength>MAX_BYTES&&Object.keys(this.bundle.pages).length){delete this.bundle.pages[Object.keys(this.bundle.pages)[0]];serialized=encoder.encode(JSON.stringify(this.bundle));}
   if(serialized.byteLength>MAX_BYTES)throw Error('Library too large for saved browsing');
   const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},this.key,serialized);
   if(version===this.version&&this.valid())localStorage.setItem(KEY,JSON.stringify({expires:this.expires,iv:base64(iv),data:base64(new Uint8Array(data))}));
  }).catch(()=>{window.dispatchEvent(new CustomEvent('noir-cache-status',{detail:'Device storage is unavailable or full. Browsing is saved for this open session only.'}));});
 }
 async remember(url:string,data:any){await this.ready;if(!this.valid())return;
  if(!Array.isArray(data.videos)&&!data.home)return;const key=keyOf(url);delete this.bundle.pages[key];this.bundle.pages[key]={at:Date.now(),data:clean(data)};
  while(Object.keys(this.bundle.pages).length>32)delete this.bundle.pages[Object.keys(this.bundle.pages)[0]];this.persist();
 }
 async fresh(meta:any){await this.ready;const s=this.bundle.snapshot;return !!s&&s.data.synced===meta.synced&&s.data.total===meta.total&&Date.now()-s.at<86400000;}
 async snapshot(meta:any,videos:any[]){await this.ready;if(!this.valid())return;const data={...clean(meta),videos:videos.map(row)};if(encoder.encode(JSON.stringify(data)).byteLength>MAX_BYTES)throw Error('This library is too large to save completely on this device. Visited pages remain available.');this.bundle.snapshot={at:Date.now(),data};this.persist();}
 async progress(id:string,seconds:number){await this.ready;if(!this.valid())return;this.bundle.progress[id]=Math.max(0,seconds);this.persist();}
 async fallback(url:string){await this.ready;if(!this.valid())return null;const u=new URL(url,'https://noir.invalid'),entry=this.bundle.pages[keyOf(url)],snapshot=this.bundle.snapshot;
  const decorate=(v:any)=>({...v,position:this.bundle.progress[v.id]??v.position});
  const saved=(data:any,at:number)=>({...data,_cached:true,_savedAt:at,searchVersion:2});
  if(entry){const data=structuredClone(entry.data);if(data.videos)data.videos=data.videos.map(decorate);if(data.home)for(const key of Object.keys(data.home))data.home[key]=data.home[key].map(decorate);return saved(data,entry.at);}
  if(!snapshot)return null;const data=snapshot.data;let videos=data.videos.map(decorate);
  const recent=(a:any,b:any)=>String(b.published).localeCompare(String(a.published))||a.id.localeCompare(b.id);
  if(u.searchParams.get('view')==='home')return saved({connected:data.connected,home:{recent:[...videos].sort(recent).slice(0,12),most:videos.filter((v:any)=>v.view_count>0).sort((a:any,b:any)=>b.view_count-a.view_count||recent(a,b)).slice(0,12),continue:videos.filter((v:any)=>v.position>0&&v.position<v.duration-15).slice(0,12)}},snapshot.at);
  const q=u.searchParams.get('q')||'',filter=u.searchParams.get('filter'),sort=u.searchParams.get('sort'),offset=Math.max(0,Number(u.searchParams.get('offset'))||0);
  videos=videos.filter((v:any)=>filter==='private'?v.privacy==='private':filter==='continue'?v.position>0&&v.position<v.duration-15:true);
  const ranked=videos.map((v:any)=>({v,rank:q?searchRank(v.title,v.description,q):-1})).filter((item:any)=>!q||item.rank>=0);
  ranked.sort((a:any,b:any)=>(q?a.rank-b.rank:0)||(sort==='title'?a.v.title.localeCompare(b.v.title):sort==='oldest'?-recent(a.v,b.v):recent(a.v,b.v)));
  return saved({...data,count:ranked.length,videos:ranked.slice(offset,offset+24).map((item:any)=>item.v)},snapshot.at);
 }
 async flushed(){await this.writer;}
}
export const libraryCache=new LibraryCache();
