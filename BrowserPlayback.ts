import {playbackRequest} from './bridge-client';
export async function openBrowserStream(id:string,signal:AbortSignal){
 const worker=new Worker(new URL('./decipher-worker.js?v=20261006-1',document.baseURI),{type:'module'});let serial=0;
 const call=(kind:string,data:unknown)=>new Promise<any>((resolve,reject)=>{
  const number=++serial;const timer=setTimeout(()=>done(new Error('Player processing timed out. Retry playback.')),30000);
  const received=(event:MessageEvent)=>{if(event.data.serial===number)done(event.data.error?new Error(event.data.error):null,event.data.result);};
  const abort=()=>done(new DOMException('Cancelled','AbortError'));const failed=()=>done(new Error('This browser could not start the player engine. Update it and retry.'));
  function done(error:Error|null,value?:unknown){clearTimeout(timer);worker.removeEventListener('message',received);worker.removeEventListener('error',failed);signal.removeEventListener('abort',abort);error?reject(error):resolve(value);}
  if(signal.aborted){abort();return;}worker.addEventListener('message',received);worker.addEventListener('error',failed);signal.addEventListener('abort',abort,{once:true});worker.postMessage({serial:number,kind,data});
 });
 try{const code=await playbackRequest('player',undefined,signal);const player=await call('prepare',code);const source=await playbackRequest('resolve',{id,player},signal);const results=await call('transform',source.transforms);return await playbackRequest('finalize',{job:source.job,results},signal);}finally{worker.terminate();}
}
