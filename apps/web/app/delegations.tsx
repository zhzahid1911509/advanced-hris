'use client';
import {useState} from 'react';

export type Grant={id:string;outgoing:boolean;other:string;expiresAt:string;revokedAt:string|null;employeeNo?:string};
type Profile={employeeNo:string;name:string;title:string;email:string;status:string};
type Props={
  grants:Grant[];busy:boolean;
  act:(fn:()=>Promise<void>)=>Promise<void>;
  api:<T>(path:string,options?:{method?:string;body?:unknown})=>Promise<T>;
  refresh:()=>void;
};
export function Delegations({grants,busy,act,api,refresh}:Props){
  const [profile,setProfile]=useState<Profile|null>(null);
  return <section className="panel"><h2>Temporary directory access</h2><p>Share one employee’s name, work email, title, employee number and status with another workspace member until the selected time.</p>
    <form onSubmit={e=>{
      e.preventDefault();
      const form=e.currentTarget;
      const data=new FormData(form);
      void act(async()=>{
        await api('delegations',{method:'POST',body:{employeeNo:data.get('employeeNo'),recipientEmail:data.get('recipient'),expiresAt:new Date(String(data.get('expires'))).toISOString()}});
        form.reset();refresh();
      });
    }}>
      <label className="field">Employee number<input name="employeeNo" required maxLength={30}/></label>
      <label className="field">Recipient’s workspace email<input name="recipient" type="email" required/></label>
      <label className="field">Expires at (local time)<input name="expires" type="datetime-local" required/></label>
      <button className="button primary" disabled={busy}>Grant profile access</button>
    </form>
    <h3>Your delegations</h3>
    {!grants.length&&<p>No sent or received delegations.</p>}
    {grants.map(g=>{
      const ended=g.revokedAt?'Revoked':Date.parse(g.expiresAt)<=Date.now()?'Expired':'';
      return <article key={g.id}><strong>{g.outgoing?'To':'From'} {g.other}</strong> {g.employeeNo} · {new Date(g.expiresAt).toLocaleString()}
        {ended?<span> · {ended}</span>:<button className="text-button" disabled={busy} onClick={()=>void act(async()=>{
          setProfile(null);
          if(g.outgoing){await api('delegations/'+g.id+'/revoke',{method:'POST',body:{}});refresh();}
          else setProfile(await api<Profile>('delegations/'+g.id+'/profile'));
        })}>{g.outgoing?'Revoke':'View shared profile'}</button>}
      </article>;
    })}
    {profile&&<section><h3>{profile.name}</h3><p>{profile.employeeNo} · {profile.title} · {profile.status}</p><p>{profile.email}</p><button className="text-button" onClick={()=>setProfile(null)}>Close profile</button></section>}
  </section>;
}
