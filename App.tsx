import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Cinema from './Cinema';
import {BACKEND,unlockLibrary,lockLibrary,setLockHandler} from './bridge-client';
function App(){
 const [unlocked,setUnlocked]=useState(false),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setLockHandler(()=>{setUnlocked(false);setPassword('');});return()=>setLockHandler(()=>{});},[]);
 async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await unlockLibrary(password);setPassword('');setUnlocked(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(unlocked)return <><div className="session-bar"><span>Your private cinema</span><button onClick={lockLibrary}>Lock library</button></div><Cinema/></>;
 return <main className="gate"><header className="header"><a className="brand" href="./">NOIR<span className="brand-sub">PRIVATE CINEMA</span></a></header><section className="connect-hero"><span className="eyebrow">YOUR PERSONAL COLLECTION</span><h1>A cinema<br/><em>of your own.</em></h1><p>Unlock your private collection with your NOIR password.</p><form onSubmit={submit} className="unlock-form"><label htmlFor="password">Your password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy||!BACKEND}/><button className="button primary" disabled={busy||!BACKEND}>{busy?'Unlocking…':'Unlock my cinema'}</button></form>{error&&<p role="alert">{error}</p>}{!BACKEND&&<p role="status">Your private backend needs to be connected before you can sign in.</p>}<small>Private library · Search all uploads · YouTube playback</small></section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
