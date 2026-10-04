import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Pause,Play} from 'lucide-react';

type Video={id:string;title:string;description:string;thumbnail:string;published:string;duration:number;privacy:string;definition:string;position:number};
const duration=(seconds:number)=>{const minutes=Math.floor((seconds||0)/60);return minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}m`;};

export default function FeaturedCarousel({videos,open,paused=false}:{videos:Video[];open:(video:Video)=>void;paused?:boolean}){
 const [slide,setSlide]=useState({current:0,previous:-1,revision:0});
 const [automatic,setAutomatic]=useState(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [hover,setHover]=useState(false),[focused,setFocused]=useState(false),[hidden,setHidden]=useState(document.hidden);
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const ids=videos.map(v=>v.id).join('|');
 useEffect(()=>{setSlide({current:0,previous:-1,revision:0});},[ids]);
 useEffect(()=>{const visibility=()=>setHidden(document.hidden);const media=matchMedia('(prefers-reduced-motion: reduce)');const motion=()=>{setReduced(media.matches);if(media.matches)setAutomatic(false);};document.addEventListener('visibilitychange',visibility);media.addEventListener('change',motion);return()=>{document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',motion);};},[]);
 function change(next:number){setSlide(previous=>({current:(next+videos.length)%videos.length,previous:previous.current,revision:previous.revision+1}));}
 useEffect(()=>{if(!automatic||paused||hover||focused||hidden||videos.length<2)return;const timer=setTimeout(()=>change(slide.current+1),6000);return()=>clearTimeout(timer);},[automatic,paused,hover,focused,hidden,slide.current,videos.length]);
 return <section className={'featured-carousel rotating-featured '+(reduced?'motion-reduced':'')} aria-label="Featured in your collection" aria-roledescription="carousel" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false);}}>
  <div className="featured-heading"><div><span className="eyebrow">NEW IN YOUR COLLECTION</span><h2>Tonight’s possibilities.</h2></div><div className="row-buttons"><button aria-label={automatic?'Pause featured slideshow':'Play featured slideshow'} aria-pressed={automatic} disabled={videos.length<2} onClick={()=>setAutomatic(value=>!value)}>{automatic?<Pause size={17}/>:<Play size={17}/>}</button><button aria-label="Previous featured videos" disabled={videos.length<2} onClick={()=>change(slide.current-1)}><ChevronLeft size={20}/></button><button aria-label="Next featured videos" disabled={videos.length<2} onClick={()=>change(slide.current+1)}><ChevronRight size={20}/></button></div></div>
  <div className="featured-track" aria-live={automatic?'off':'polite'}>
   {Array.from({length:Math.min(1,videos.length)},(_,slot)=>{
    const index=(slide.current+slot)%videos.length,video=videos[index];
    const old=slide.previous>=0?videos[(slide.previous+slot)%videos.length]:null;
    const resume=video.position>0&&video.position<video.duration-15;
    return <article className="featured-tile" key={slot} style={{'--cascade-delay':`${slot*110}ms`} as React.CSSProperties} aria-label={`${index+1} of ${videos.length}: ${video.title}`}>
     <div className={slide.revision?'featured-image-transition':'featured-image-still'} key={'art'+slide.revision}>{old&&<img className="featured-art featured-art-out" src={old.thumbnail} alt="" decoding="async"/>}<img className="featured-art featured-art-in" src={video.thumbnail} alt="" decoding="async"/></div>
     <div className="featured-overlay"/>
     <span className="featured-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
     <div className={'featured-copy '+(slide.revision?'featured-copy-enter':'')} key={'copy'+slide.revision}><div className="featured-meta"><span>{new Date(video.published).getFullYear()}</span><span>{duration(video.duration)}</span><span className="badge">{video.privacy}</span></div><h3>{video.title}</h3><p>{video.description||'Your next watch is waiting.'}</p><button className="button primary" onClick={()=>open(video)} aria-label={`${resume?'Resume':'Watch'} ${video.title}`}><Play size={17} fill="currentColor"/>{resume?'Resume watching':'Watch now'}</button></div>
     {resume&&<div className="featured-progress" aria-label={`${Math.round(video.position/video.duration*100)}% watched`}><span style={{width:Math.min(100,video.position/video.duration*100)+'%'}}/></div>}
    </article>;
   })}
  </div>
  <div className="featured-pagination" aria-label="Choose a featured movie">{videos.map((v,index)=><button key={v.id} className={index===slide.current?'active':''} aria-label={`Show ${v.title}`} aria-current={index===slide.current?'true':undefined} onClick={()=>change(index)}/>)}<span>{String(slide.current+1).padStart(2,'0')} / {String(videos.length).padStart(2,'0')}</span></div>
 </section>;
}
