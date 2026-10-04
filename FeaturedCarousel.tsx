import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Play} from 'lucide-react';

type Video={id:string;title:string;description:string;thumbnail:string;published:string;duration:number;privacy:string;definition:string;position:number};
const duration=(seconds:number)=>{const minutes=Math.floor((seconds||0)/60);return minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}m`;};

export default function FeaturedCarousel({videos,open}:{videos:Video[];open:(video:Video)=>void}){
 const track=useRef<HTMLDivElement>(null);
 const [edges,setEdges]=useState({start:true,end:true});
 useEffect(()=>{
  const element=track.current;if(!element)return;
  const update=()=>setEdges({start:element.scrollLeft<2,end:element.scrollLeft+element.clientWidth>=element.scrollWidth-2});
  const observer=new ResizeObserver(update);observer.observe(element);
  element.addEventListener('scroll',update,{passive:true});update();
  return()=>{observer.disconnect();element.removeEventListener('scroll',update);};
 },[videos.length]);
 function move(direction:number){const element=track.current;if(!element)return;const card=element.firstElementChild as HTMLElement|null;element.scrollBy({left:direction*(card?.nextElementSibling?(card.nextElementSibling as HTMLElement).offsetLeft-card.offsetLeft:element.clientWidth),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 return <section className="featured-carousel" aria-label="Featured in your collection">
  <div className="featured-heading"><div><span className="eyebrow">LATEST IN YOUR COLLECTION</span><h2>Tonight’s possibilities.</h2></div><div className="row-buttons"><button aria-label="Previous featured videos" disabled={edges.start} onClick={()=>move(-1)}><ChevronLeft size={20}/></button><button aria-label="Next featured videos" disabled={edges.end} onClick={()=>move(1)}><ChevronRight size={20}/></button></div></div>
  <div className="featured-track" ref={track}>
   {videos.map((video,index)=>{
    const resume=video.position>0&&video.position<video.duration-15;
    return <article className="featured-tile" key={video.id}>
     <img className="featured-art" src={video.thumbnail} alt="" loading={index<3?'eager':'lazy'} decoding="async"/>
     <div className="featured-overlay"/>
     <span className="featured-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
     <div className="featured-copy"><div className="featured-meta"><span>{new Date(video.published).getFullYear()}</span><span>{duration(video.duration)}</span><span className="badge">{video.privacy}</span></div><h3>{video.title}</h3><p>{video.description||'Your next watch is waiting.'}</p><button className="button primary" onClick={()=>open(video)} aria-label={`${resume?'Resume':'Watch'} ${video.title}`}><Play size={17} fill="currentColor"/>{resume?'Resume watching':'Watch now'}</button></div>
     {resume&&<div className="featured-progress" aria-label={`${Math.round(video.position/video.duration*100)}% watched`}><span style={{width:Math.min(100,video.position/video.duration*100)+'%'}}/></div>}
    </article>;
   })}
  </div>
 </section>;
}
