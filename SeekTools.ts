export type SeekThumbnail={url:string;cols:number;rows:number;col:number;row:number;width:number;height:number};
export function seekTarget(base:number,fraction:number,duration:number){return Math.max(0,Math.min(Math.max(0,duration-.001),base+fraction*120));}
export function storyboardThumbnail(spec:unknown,seconds:number):SeekThumbnail|null{
 try{if(typeof spec!=='string'||spec.length>20000||!Number.isFinite(seconds))return null;
  const parts=spec.split('|'),base=parts.shift()!.replaceAll('\\','');
  const levels=parts.map((part,level)=>{const p=part.split('#');return {level,w:Number(p[0]),h:Number(p[1]),count:Number(p[2]),cols:Number(p[3]),rows:Number(p[4]),interval:Number(p[5]),name:p[6],sig:p[7]};}).filter(p=>[p.w,p.h,p.count,p.cols,p.rows,p.interval].every(Number.isSafeInteger)&&p.w>0&&p.w<=160&&p.h>0&&p.h<=160&&p.count>0&&p.cols>0&&p.cols<=10&&p.rows>0&&p.rows<=10&&p.interval>0&&p.w*p.cols*p.h*p.rows<=1_000_000&&p.name&&p.sig).sort((a,b)=>b.w-a.w);
  const p=levels[0];if(!p)return null;const tile=Math.min(p.count-1,Math.floor(Math.max(0,seconds)*1000/p.interval)),group=Math.floor(tile/(p.cols*p.rows)),cell=tile%(p.cols*p.rows);
  const raw=base.replaceAll('$L',String(p.level)).replaceAll('$N',p.name).replaceAll('$M',String(group));const url=new URL(raw);
  if(url.protocol!=='https:'||!['i.ytimg.com','i9.ytimg.com'].includes(url.hostname)||url.username||url.password||!url.pathname.startsWith('/sb/'))return null;
  url.searchParams.set('sigh',p.sig);return {url:url.href,cols:p.cols,rows:p.rows,col:cell%p.cols,row:Math.floor(cell/p.cols),width:p.w,height:p.h};
 }catch{return null;}
}
