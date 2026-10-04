import type {Env} from './worker';
import {sourceURL} from './playback-security';
import type {OAuth2Tokens} from 'youtubei.js';
let sdkPromise:Promise<typeof import('youtubei.js/cf-worker')>|undefined;
export async function createYouTube(_env:Env){
 const sdk=await (sdkPromise??=import('youtubei.js/cf-worker'));
 sdk.Log.setLevel(sdk.Log.Level.NONE);
 // Heavy script extraction/evaluation takes place in the owner's browser, not in a Free Worker.
 return sdk.Innertube.create({client_type:sdk.ClientType.TV,generate_session_locally:true,enable_session_cache:false,retrieve_player:false,fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(25000)})});
}
export async function publicPlayer(){
 const response=await fetch('https://www.youtube.com/iframe_api',{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Player unavailable');
 const code=await response.text();const id=code.split('player\\/')[1]?.split('\\/')[0];if(!id||! /^[a-zA-Z0-9_-]{6,32}$/.test(id))throw new Error('Player ID unavailable');
 const url='https://www.youtube.com/s/player/'+id+'/player_es6.vflset/en_US/base.js';
 const js=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!js.ok)throw new Error('Player script unavailable');
 const script=await js.text();if(script.length>4_000_000)throw new Error('Player script too large');return {id,script};
}
export type TransformRequest={index:number;n?:string;sig?:string;sp?:string};
export type SavedAccount=OAuth2Tokens;
export async function makeManifest(env:Env,credentials:SavedAccount,videoId:string,base:string,persist:(tokens:SavedAccount)=>Promise<void>,playerInfo:{id:string;timestamp:number}){
 const yt=await createYouTube(env);const writes:Promise<void>[]=[];
 yt.session.on('update-credentials',()=>{writes.push(persist({...yt.session.oauth.oauth2_tokens!,client:yt.session.oauth.client_id}));});
 try{
  await yt.session.signIn(credentials);
  const sdk=await sdkPromise!;
  const requests=new Map<string,Omit<TransformRequest,'index'>>();
  const player=new sdk.Player(playerInfo.id,playerInfo.timestamp,undefined);
  player.decipher=async(url?:string,signatureCipher?:string,cipher?:string)=>{
   const value=signatureCipher||cipher||url;if(!value)throw new Error('Missing stream');
   const args=new URLSearchParams(value),raw=new URL(args.get('url')||value);sourceURL(raw.href);
   const n=raw.searchParams.get('n')||undefined,sig=(signatureCipher||cipher)?args.get('s')||undefined:undefined,sp=args.get('sp')||'signature';
   if(n||sig)requests.set(raw.href,{n,sig,sp});return raw.href;
  };
  yt.session.player=player;
  const info=await yt.getBasicInfo(videoId,{client:'TV'});
  if(info.playability_status?.status!=='OK')throw new Error('YouTube denied playback');
  if(info.basic_info.is_live||info.basic_info.is_post_live_dvr)throw new Error('Live playback is unsupported');
  const sources:string[]=[];
  // Avoid storyboard fetches and OTF/SABR URLs that require a different transport.
  info.storyboards=undefined;
  const manifest=await info.toDash({manifest_options:{captions_format:'vtt',is_sabr:false},format_filter:f=>!Boolean(f.init_range&&f.index_range&&!f.is_type_otf&&(f.url||f.signature_cipher||f.cipher)),url_transformer:u=>{
   sourceURL(u.href);const index=sources.push(u.href)-1;return new URL(base+'/'+index);
  }});
  if(!manifest.includes('<Representation')||!sources.length||manifest.includes('googlevideo.com')||manifest.includes('youtube.com'))throw new Error('No direct adaptive streams');
  return {manifest,sources,pending:true,transforms:sources.flatMap((url,index)=>requests.has(url)?[{index,...requests.get(url)!}]:[])};
 }finally{await Promise.all(writes);}
}
