// Normalize placement while preserving cue timing, language and inline styling.
export function centeredCue(cue:any,engine:any):any{
 const result=cue.clone();
 result.textAlign='center';result.position=50;result.positionAlign='center';
 result.line=null;result.size=90;result.displayAlign='after';
 result.region=new engine.text.CueRegion();
 result.nestedCues=(cue.nestedCues||[]).map((nested:any)=>{
  const child=centeredCue(nested,engine);child.position=null;child.size=0;return child;
 });
 return result;
}
export function centeredTextFactory(factory:(player:any)=>any,engine:any){
 return (player:any)=>{
  const display=factory(player),append=display.append.bind(display);
  display.append=(cues:any[])=>append(cues.map(cue=>centeredCue(cue,engine)));
  return display;
 };
}
