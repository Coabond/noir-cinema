import {useEffect,useState} from 'react';
import {playbackRequest} from './bridge-client';
export default function PlaybackAccount({onConnected}:{onConnected?:()=>void}){
 const [connected,setConnected]=useState(false),[checking,setChecking]=useState(true),[available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[code,setCode]=useState<{code:string;url:string;expires:number;interval:number}|null>(null);
 useEffect(()=>{const controller=new AbortController();playbackRequest('account',undefined,controller.signal).then(j=>{setConnected(j.connected);setAvailable(j.available);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});return()=>controller.abort();},[]);
 useEffect(()=>{
  if(!code)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{
   if(Date.now()>=code.expires){setCode(null);setError('The code expired. Request another code.');return;}
   const j=await playbackRequest('poll',{},controller.signal);if(controller.signal.aborted)return;
   if(j.connected){setConnected(true);setCode(null);onConnected?.();return;}
   timer=setTimeout(poll,Math.max(5000,j.interval||code.interval));
  }catch(e){if(!controller.signal.aborted){setCode(null);setError((e as Error).message);}}};
  timer=setTimeout(poll,code.interval);return()=>{clearTimeout(timer);controller.abort();};
 },[code,onConnected]);
 async function connect(){setBusy(true);setError('');try{setCode(await playbackRequest('activate',{}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function disconnect(){setBusy(true);setError('');try{await playbackRequest('disconnect',{});setConnected(false);setCode(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="playback-account"><span className="eyebrow">YOUTUBE PLAYBACK</span><h3>{connected?'Your player is connected':'Connect once. Settle in.'}</h3><p>{connected?'Your playback account is stored encrypted in Cloudflare. Unlock NOIR to use it on your next visit.':'Approve NOIR with the YouTube account that owns your private uploads. Your library credentials stay in Cloudflare; this approval connects the player separately.'}</p>
 {error&&<p className="notice" role="alert">{error}</p>}
 {checking?<p role="status">Checking your player connection…</p>:!available?<p className="notice">The new Cloudflare playback service needs to be deployed before connecting.</p>:connected?<button className="button secondary" disabled={busy} onClick={disconnect}>Disconnect playback account</button>:code?<div className="activation"><span>Open this Google approval page on your phone or computer:</span><a href={code.url} target="_blank" rel="noopener noreferrer">{new URL(code.url).hostname}{new URL(code.url).pathname}</a><strong aria-label="YouTube activation code">{code.code}</strong><p role="status">Waiting for your approval… Select the channel that owns your uploads.</p><button className="button secondary" onClick={()=>setCode(null)}>Cancel</button></div>:<button className="button primary" disabled={busy} onClick={connect}>{busy?'Requesting your code…':'Connect YouTube'}</button>}
 </section>;
}
