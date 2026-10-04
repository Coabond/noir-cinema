import type {Env} from './worker';
import {sourceURL} from './playback-security';
import type {OAuth2Tokens} from 'youtubei.js';
export class PlaybackFailure extends Error {constructor(public code:string){super(code);}}
export function streamKey(value:string){const u=new URL(value);u.searchParams.delete('cpn');return u.href;}
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
 let stage='SESSION';
 const yt=await createYouTube(env);const writes:Promise<void>[]=[];
 yt.session.on('update-credentials',()=>{writes.push(persist({...yt.session.oauth.oauth2_tokens!,client:yt.session.oauth.client_id}));});
 try{
  stage='ACCOUNT';await yt.session.signIn(credentials);
  const sdk=await sdkPromise!;
  const requests=new Map<string,Omit<TransformRequest,'index'>>();
  const player=new sdk.Player(playerInfo.id,playerInfo.timestamp,undefined);
  player.decipher=async(url?:string,signatureCipher?:string,cipher?:string)=>{
   const value=signatureCipher||cipher||url;if(!value)throw new Error('Missing stream');
   const args=new URLSearchParams(value),raw=new URL(args.get('url')||value);try{sourceURL(raw.href);}catch{throw new PlaybackFailure('FORMAT_DESTINATION');}
   const n=raw.searchParams.get('n')||undefined,sig=(signatureCipher||cipher)?args.get('s')||undefined:undefined,sp=args.get('sp')||'signature';
   if(n||sig)requests.set(streamKey(raw.href),{n,sig,sp});return raw.href;
  };
  yt.session.player=player;
  // Match the authenticated compatibility profile used by the working APK.
  // Modern TV uses a different player variant and rejects the browser's timestamp.
  Object.assign(yt.session.context.client,{clientVersion:'5.20260901',clientScreen:'WATCH',userAgent:'Mozilla/5.0 (DirectFB; Linux x86_64) Cobalt/4.13031-qa (unlike Gecko) Starboard/1'});
  yt.session.user_agent=yt.session.context.client.userAgent!;
  stage='PLAYER_RESPONSE';
  const response=await yt.actions.execute('/player',{videoId,racyCheckOk:true,contentCheckOk:true,playbackContext:{contentPlaybackContext:{html5Preference:'HTML5_PREF_WANTS',lactMilliseconds:60000,isInlinePlaybackNoAd:true,signatureTimestamp:playerInfo.timestamp},devicePlaybackCapabilities:{supportsVp9Encoding:true,supportXhr:false}}});
  const status=response.data.playabilityStatus;
  if(status?.status!=='OK'){
   const reason=String(status?.reason||'').toLowerCase();
   const category=/private/.test(reason)?'PRIVATE_ACCOUNT':/sign in|bot/.test(reason)?'SIGN_IN':/country|region/.test(reason)?'REGION':/age/.test(reason)?'AGE':'UNPLAYABLE';
   throw new PlaybackFailure('YOUTUBE_'+category);
  }
  const info=new sdk.YT.VideoInfo([response],yt.actions,crypto.randomUUID().replaceAll('-','').slice(0,16));
  if(info.playability_status?.status!=='OK')throw new PlaybackFailure('YOUTUBE_'+(['LOGIN_REQUIRED','UNPLAYABLE','ERROR','CONTENT_CHECK_REQUIRED'].includes(info.playability_status?.status||'')?info.playability_status!.status:'DENIED'));
  if(info.basic_info.is_live||info.basic_info.is_post_live_dvr)throw new PlaybackFailure('LIVE_UNSUPPORTED');
  const formats=info.streaming_data?.adaptive_formats||[];
  if(!formats.some(f=>f.init_range&&f.index_range&&!f.is_type_otf&&(f.url||f.signature_cipher||f.cipher)))throw new PlaybackFailure(formats.length?'NO_DIRECT_FORMATS':'NO_FORMATS');
  const sources:string[]=[];stage='MANIFEST';
  // Avoid storyboard fetches and OTF/SABR URLs that require a different transport.
  info.storyboards=undefined;
  const manifest=await info.toDash({manifest_options:{captions_format:'vtt',is_sabr:false},format_filter:f=>!Boolean(f.init_range&&f.index_range&&!f.is_type_otf&&(f.url||f.signature_cipher||f.cipher)),url_transformer:u=>{
   try{sourceURL(u.href);}catch{throw new PlaybackFailure('MANIFEST_DESTINATION');}const index=sources.push(u.href)-1;return new URL(base+'/'+index);
  }});
  if(!manifest.includes('<Representation')||!sources.length||manifest.includes('googlevideo.com')||manifest.includes('youtube.com'))throw new PlaybackFailure('EMPTY_MANIFEST');
  return {manifest,sources,pending:true,transforms:sources.flatMap((url,index)=>requests.has(streamKey(url))?[{index,...requests.get(streamKey(url))!}]:[])};
 }catch(error){if(error instanceof PlaybackFailure)throw error;const message=error instanceof Error?error.message:'';const detail=stage==='MANIFEST'?(message.includes('Invalid URL')?'_URL':message.includes('undefined')?'_MISSING_FIELD':message.includes('range')?'_RANGE':error instanceof TypeError?'_TYPE':''):'';throw new PlaybackFailure(stage+detail);}
 finally{try{await Promise.all(writes);}catch{throw new PlaybackFailure('ACCOUNT_SAVE');}}
}
