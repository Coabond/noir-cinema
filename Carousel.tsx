import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Pause,Play} from 'lucide-react';
export default function Carousel({title,note,videos,open,paused=false}:{title:string;note:string;videos:any[];open:(video:any)=>void;paused?:boolean}){
 const section=useRef<HTMLElement>(null),track=useRef<HTMLDivElement>(null);
 const [automatic,setAutomatic]=useState(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [hover,setHover]=useState(false),[focused,setFocused]=useState(false),[touching,setTouching]=useState(false),[visible,setVisible]=useState(false),[hidden,setHidden]=useState(document.hidden),[scrollable,setScrollable]=useState(false);
 const ids=videos.map(v=>v.id).join('|');
 useEffect(()=>{
  const element=section.current;if(!element)return;
  const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{threshold:.1});observer.observe(element);
  const visibility=()=>setHidden(document.hidden),media=matchMedia('(prefers-reduced-motion: reduce)');
  const motion=()=>{if(media.matches)setAutomatic(false);};
  document.addEventListener('visibilitychange',visibility);media.addEventListener('change',motion);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',motion);};
 },[]);
 useEffect(()=>{
  const element=track.current;if(!element){setScrollable(false);return;}
  const update=()=>setScrollable(element.scrollWidth>element.clientWidth+2);
  const observer=new ResizeObserver(update);observer.observe(element);update();
  return()=>observer.disconnect();
 },[ids]);
 const move=(direction:number)=>{
  const element=track.current;if(!element)return;
  const card=element.firstElementChild as HTMLElement|null;
  const distance=card?.nextElementSibling?(card.nextElementSibling as HTMLElement).offsetLeft-card.offsetLeft:element.clientWidth;
  const end=element.scrollWidth-element.clientWidth;
  const next=direction>0?(element.scrollLeft>=end-2?0:Math.min(end,element.scrollLeft+distance)):(element.scrollLeft<=2?end:Math.max(0,element.scrollLeft-distance));
  element.scrollTo({left:next,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 };
 useEffect(()=>{
  if(!automatic||paused||hover||focused||touching||!visible||hidden||!scrollable)return;
  const timer=setInterval(()=>move(1),3000);return()=>clearInterval(timer);
 },[automatic,paused,hover,focused,touching,visible,hidden,scrollable,ids]);
 return <section ref={section} className={'home-row animated-home-row '+(visible?'row-visible':'')} aria-label={title} aria-roledescription="carousel" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false);}} onTouchStart={()=>setTouching(true)} onTouchEnd={()=>setTouching(false)} onTouchCancel={()=>setTouching(false)}><div className="home-row-heading"><div><h2>{title}</h2><p>{note}</p></div><div className="row-buttons"><button aria-label={(automatic?'Pause ':'Play ')+title+' slideshow'} aria-pressed={automatic} disabled={!scrollable} onClick={()=>setAutomatic(value=>!value)}>{automatic?<Pause size={17}/>:<Play size={17}/>}</button><button aria-label={'Previous '+title} onClick={()=>move(-1)} disabled={!scrollable}><ChevronLeft/></button><button aria-label={'Next '+title} onClick={()=>move(1)} disabled={!scrollable}><ChevronRight/></button></div></div>{videos.length?<div ref={track} className="carousel-track">{videos.map(video=><button className="video-card carousel-card" key={video.id} onClick={()=>open(video)}><div className="poster"><img src={video.thumbnail} loading="lazy" alt=""/><span className="card-play"><Play fill="currentColor"/></span>{video.position>0&&video.position<video.duration-15&&<div className="progress"><span style={{width:Math.min(100,video.position/video.duration*100)+'%'}}/></div>}</div><h3>{video.title}</h3><div className="card-meta">{title==='Most watched'?(Number(video.view_count)||0).toLocaleString()+' YouTube views':video.position>0?'Resume from '+Math.floor(video.position/60)+' min':new Date(video.published).toLocaleDateString()}</div></button>)}</div>:<div className="row-empty">{title==='Continue watching'?'Start a film and your saved place will appear here.':title==='Most watched'?'Sync your library to load YouTube view counts.':'Your recent uploads will appear after syncing.'}</div>}</section>;
}
