'use client';
import {PasswordInput} from './profile-controls';
import { useEffect, useState, type FormEvent } from 'react';

type Session = {handle:string;agent:string;current:boolean;createdAt:string;expiresAt:string};
type Status = {enabled:boolean;recoveryRemaining:number;sessions:Session[]};
type Client = <T>(path:string, options?:{method?:string;body?:unknown})=>Promise<T>;

export function AccountSecurity({api}:{api:Client}) {
  const [status,setStatus] = useState<Status|null>(null);
  const [key,setKey] = useState('');
  const [codes,setCodes] = useState<string[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  useEffect(()=>{
    let active = true;
    api<Status>('account/security').then(result=>{if(active)setStatus(result);})
      .catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[revision]); // Mounted for the signed-in account only.

  async function action(path:string,body:unknown) {
    setBusy(true);setError('');
    try {
      const result = await api<{manualKey?:string;recoveryCodes?:string[]}>('account/'+path,{method:'POST',body});
      setKey(result.manualKey || '');
      setCodes(result.recoveryCodes || []);
      setRevision(value=>value+1);
    } catch(e) {setError((e as Error).message);}
    finally {setBusy(false);}
  }

  function submit(event:FormEvent<HTMLFormElement>,path:string) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    form.reset();
    void action(path,body);
  }

  return <section>
    <h3>Account security</h3>
    {error && <p role="alert" className="alert error">{error}</p>}
    {codes.length>0 && <div className="panel" style={{padding:16,marginBottom:16}}>
      <strong>Save your recovery codes now</strong>
      <p>Each code works once. Store them somewhere you can access if you lose your phone.</p>
      <pre>{codes.join('\n')}</pre>
      <button className="button secondary" onClick={()=>setCodes([])}>I saved my codes</button>
    </div>}
    {status && <><p>{status.enabled?'Authenticator enabled · '+status.recoveryRemaining+' recovery codes remaining.':'Set up an authenticator to protect sign-in. Administrators need it to invite people or change access.'}</p>
      <form key={status.enabled?'enabled':key?'confirm':'start'} onSubmit={e=>submit(e,status.enabled?'disable':key?'confirm':'enroll')}>
        {key && <><p>In your authenticator app, add a time-based entry named Advanced HRIS. Enter this setup key, then enter the six-digit code below.</p><p><code>{key}</code></p></>}
        {!key && <label className="field"><span>Current password</span><PasswordInput name="password" required autoComplete="current-password"/></label>}
        {(key || status.enabled) && <label className="field"><span>{key?'Authenticator code':'Authenticator or recovery code'}</span><input name="code" required maxLength={48} autoComplete="one-time-code"/></label>}
        <button disabled={busy} className="button secondary">{status.enabled?'Disable authenticator':key?'Confirm enrollment':'Set up authenticator'}</button>
      </form>
      <h3 className="timeline-title">Signed-in sessions</h3>
      <ul className="timeline">{status.sessions.map(s=><li key={s.handle}><div>
        <strong>{s.current?'This session':'Other session'}</strong>
        <small>{s.agent || 'Device information unavailable'}</small>
        <small>Signed in {new Date(s.createdAt).toLocaleString()} · Expires {new Date(s.expiresAt).toLocaleString()}</small>
        {!s.current && <button className="text-button" disabled={busy} onClick={()=>action('sessions/'+s.handle+'/revoke',{})}>Sign out this session</button>}
      </div></li>)}</ul></>}
  </section>;
}
