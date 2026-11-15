'use client';
import {useState} from 'react';

export type DirectoryRole={id:string;name:string;scope:string;showPhone:boolean;version:number};
export function RoleEditor({roles,busy,save,remove}:{remove:(role:DirectoryRole)=>Promise<boolean>;roles:DirectoryRole[];busy:boolean;save:(id:string,body:Record<string,unknown>)=>Promise<boolean>}){
  const [id,setId]=useState('');
  const role=roles.find(row=>row.id===id);
  return <fieldset><legend>Custom directory roles</legend>
    <label>Role to edit <select value={id} onChange={e=>setId(e.target.value)}>
      <option value="">Create a role</option>
      {roles.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
    <form key={id+'-'+(role?.version??0)} onSubmit={async e=>{
      e.preventDefault();
      const form=e.currentTarget;
      const data=new FormData(form);
      const body={name:data.get('name'),scope:data.get('scope'),showPhone:data.has('phone'),...(role?{version:role.version}:{})};
      if(await save(id,body)){form.reset();setId('');}
    }}>
      <label>Role name <input name="name" required minLength={2} maxLength={70} defaultValue={role?.name}/></label>
      <label>Visible employees <select name="scope" defaultValue={role?.scope??'SELF'}>
        {Object.entries({SELF:'Own record',TEAM:'Self and direct reports',BRANCH:'Own branch',DEPARTMENT:'Own department',TENANT:'Entire workspace'}).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label><input type="checkbox" name="phone" defaultChecked={role?.showPhone}/> Show employee phone</label>
      <button className="button secondary" disabled={busy}>{role?'Update role':'Create role'}</button>
    </form>
    {role&&<button type="button" className="text-button" disabled={busy} onClick={async()=>{
      if(window.confirm('Remove '+role.name+' from this workspace?') && await remove(role)) setId('');
    }}>Remove role</button>}
  </fieldset>;
}
