export type CaptionCue={start:number;end:number;text:string};
export const MAX_SUBTITLE_BYTES=2*1024*1024;
export function clampZoom(value:number){return Number.isFinite(value)?Math.max(1,Math.min(3,value)):1;}
export function frameTarget(at:number,duration:number,fps:number,direction:number){const rate=fps>=1&&fps<=240?fps:30;return Math.max(0,Math.min(Number.isFinite(duration)?Math.max(0,duration-0.001):Infinity,at+direction/rate));}
export function parseSubtitles(input:string):CaptionCue[]{
 if(input.length>MAX_SUBTITLE_BYTES)throw new Error('Subtitle file is too large (maximum 2 MB).');
 const value=input.replace(/\r\n?/g,'\n').replace(/^\uFEFF/,'');const cues:CaptionCue[]=[];
 const stamp=(s:string)=>s.replace(',','.').split(':').reduce((total,part)=>total*60+Number(part),0);
 for(const block of value.split(/\n[ \t]*\n/)){
  const match=/^\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})[^\n]*\n/m.exec(block);if(!match)continue;
  const start=stamp(match[1]),end=stamp(match[2]),text=block.slice(match.index+match[0].length).replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim().slice(0,4000);
  if(end>start&&text)cues.push({start,end,text});if(cues.length>20000)throw new Error('Too many subtitle cues (maximum 20,000).');
 }
 if(!cues.length)throw new Error('No readable SRT or WebVTT subtitles were found.');return cues.sort((a,b)=>a.start-b.start);
}
export function captionAt(cues:CaptionCue[],at:number){let lo=0,hi=cues.length;while(lo<hi){const mid=(lo+hi)>>>1;if(cues[mid].start<=at)lo=mid+1;else hi=mid;}return lo&&at<cues[lo-1].end?cues[lo-1].text:'';}
