import {Player,Platform,Log} from 'youtubei.js/web';
import {newQuickJSWASMModuleFromVariant,newVariant} from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
Log.setLevel(Log.Level.NONE);
let player:Player|undefined;
const vm=newQuickJSWASMModuleFromVariant(newVariant(variant,{wasmBinary:async()=>{const r=await fetch(new URL('./decipher.wasm',import.meta.url));if(!r.ok)throw new Error('Player engine unavailable');return r.arrayBuffer();}}));
Platform.shim.eval=async data=>{
 if(data.output.length>2_000_000)throw new Error('Player program too large');
 const engine=await vm,runtime=engine.newRuntime();runtime.setMemoryLimit(32*1024*1024);runtime.setMaxStackSize(1024*1024);const deadline=Date.now()+250;runtime.setInterruptHandler(()=>Date.now()>deadline);const context=runtime.newContext();
 // No host functions, network, DOM, account tokens or filesystem are exposed to this VM.
 try{const result=context.evalCode('(function(){'+data.output+'\n})()');if(result.error){result.error.dispose();throw new Error('Player transformation failed');}const value=context.dump(result.value);result.value.dispose();return value;}finally{context.dispose();runtime.dispose();}
};
self.onmessage=async event=>{const {serial,kind,data}=event.data;try{
 let result:any;
 if(kind==='prepare'){
  if(typeof data.id!=='string'||typeof data.script!=='string'||data.script.length>4_000_000)throw new Error('Invalid player');
  player=await Player.create(undefined,async()=>new Response(data.script),undefined,data.id);result={id:player.player_id,timestamp:player.signature_timestamp};
 }else if(kind==='transform'){
  if(!player||!Array.isArray(data)||data.length>150)throw new Error('Invalid stream');const cache=new Map<string,string>();result=[];
  for(const item of data){const url=new URL('https://r1.googlevideo.com/videoplayback');if(item.n)url.searchParams.set('n',item.n);let cipher:string|undefined;if(item.sig)cipher=new URLSearchParams({url:url.href,s:item.sig,sp:item.sp||'signature'}).toString();const transformed=new URL(await player.decipher(cipher?undefined:url.href,cipher,undefined,cache));result.push({index:item.index,...(item.n?{n:transformed.searchParams.get('n')}:{}),...(item.sig?{sig:transformed.searchParams.get(item.sp||'signature')}:{})});}
 }else if(kind==='fixture'){result=await Platform.shim.eval({output:data.output} as any,{});}else throw new Error('Unsupported operation');
 self.postMessage({serial,result});
 }catch{self.postMessage({serial,error:'YouTube player processing failed. Retry playback.'});}};
