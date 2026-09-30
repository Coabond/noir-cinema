import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Cinema from './Cinema';
import {BACKEND,connectLibrary,lockLibrary} from './bridge-client';
function App(){
 const [state,setState]=useState('locked');
 if(state==='ready')return <><div className="session-bar"><span>Private session connected</span><button onClick={lockLibrary}>Lock library</button></div><Cinema/></>;
 const message=state==='blocked'?'Allow pop-ups for this site, then connect again.':state==='timeout'?'Finish signing in in the private window, then connect again.':state==='expired'?'Your private session ended. Connect again to continue.':state==='connecting'?'In the sign-in window, choose “Connect my cinema”. Keep that window open while you watch.':'Sign in to open your private collection. Your library is visible only after you connect.';
 return <main className="gate"><header className="header"><a className="brand" href="./">NOIR<span className="brand-sub">PRIVATE CINEMA</span></a></header><section className="connect-hero"><span className="eyebrow">YOUR PERSONAL COLLECTION</span><h1>A cinema<br/><em>of your own.</em></h1><p role="status">{message}</p><button className="button primary" onClick={()=>connectLibrary(setState)}>{state==='connecting'?'Open connection again':'Connect private library'}</button><a className="gate-link" href={BACKEND} target="_blank" rel="noopener noreferrer">Manage YouTube connection</a><small>Private sign-in · Search your entire library · YouTube playback</small></section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
