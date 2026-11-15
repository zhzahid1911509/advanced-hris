'use client';
import {useEffect,useState} from 'react';

type DocumentRow={id:string;name:string;status:string;version:number;expiresOn:string|null};
type ReleaseResult={diagnostic?:{stage:'scan'|'storage';code:string;httpStatus?:number}};
type Props={employeeId:string;api:<T>(path:string,options?:{method?:string;body?:unknown})=>Promise<T>};

export function EmployeeDocuments({employeeId,api}:Props){
 const path='employees/'+employeeId+'/documents';
 const [rows,setRows]=useState<DocumentRow[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;
  api<DocumentRow[]>(path).then(data=>{if(active)setRows(data);}).catch(e=>{if(active)setMessage(e.message);});
  return ()=>{active=false;};
 },[path]); // Tenant and employee changes remount this component.
 async function release(target:string,body:unknown){
  const result=await api<ReleaseResult>(target,{method:'POST',body});
  if(result.diagnostic){
   const {stage,code,httpStatus}=result.diagnostic;
   const step=stage==='scan'?'ClamAV scan':'Private storage upload';
   setMessage(step+' failed ('+code+(httpStatus?', HTTP '+httpStatus:'')+'). The document is quarantined.');
  }
 }
 async function perform(action:()=>Promise<void>){
  setBusy(true);setMessage('');
  try{await action();setRows(await api<DocumentRow[]>(path));}
  catch(e){setMessage((e as Error).message);}
  finally{setBusy(false);}
 }
 return <section><h3>Private documents</h3><form onSubmit={e=>{
  e.preventDefault();const form=e.currentTarget;const data=new FormData(form);
  void perform(async()=>{
   const file=data.get('file') as File;
   if(file.size>2097152)throw new Error('Choose a PDF up to 2 MiB.');
   const content=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('File could not be read.'));reader.readAsDataURL(file);
   });
   await release(path,{id:crypto.randomUUID(),name:file.name,content,expiresOn:data.get('expires')||null});
   form.reset();
  });
 }}>
 <label className="field">PDF (up to 2 MiB)<input type="file" accept="application/pdf,.pdf" name="file" required/></label>
 <label className="field">Document expiry date (optional)<input type="date" name="expires"/></label>
 <button className="button secondary" disabled={busy}>Upload document</button></form>
 {message&&<p role="alert">{message}</p>}
 {rows.map(d=><article key={d.id}><strong>{d.name}</strong> · v{d.version} · {d.status}{d.expiresOn?' · Expires '+d.expiresOn.slice(0,10):''}
 {d.status==='QUARANTINED'&&<button className="text-button" disabled={busy} onClick={()=>void perform(async()=>{await release(path+'/'+d.id+'/retry',{});})}>Retry scan and release</button>}
 {d.status==='READY'&&<button className="text-button" disabled={busy} onClick={()=>void perform(async()=>{const {url}=await api<{url:string}>(path+'/'+d.id+'/download',{method:'POST',body:{}});window.location.assign(url);})}>Download</button>}
 </article>)}</section>;
}
