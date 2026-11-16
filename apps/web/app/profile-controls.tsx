'use client';
import {useState,type InputHTMLAttributes} from 'react';
import {Eye,EyeOff} from 'lucide-react';

export function PasswordInput(props:InputHTMLAttributes<HTMLInputElement>){
 const [shown,setShown]=useState(false);
 return <span className="password-control"><input {...props} type={shown?'text':'password'}/>
 <button type="button" aria-label={shown?'Hide password':'Show password'} aria-pressed={shown} onClick={()=>setShown(!shown)}>
 {shown?<EyeOff size={18}/>:<Eye size={18}/>}</button></span>;
}
export function Avatar({photo,fallback}:{photo?:string|null;fallback:string}){
 return photo?<img className="hris-avatar-image" src={photo} alt=""/>:<>{fallback}</>;
}
type PhotoProps={label:string;photo?:string|null;save:(content:string|null)=>Promise<void>};
export function PhotoInput({label,photo,save}:PhotoProps){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function update(file:File|null){
  setBusy(true);setMessage('');
  try{
   if(file&&file.size>2097152)throw new Error('Choose a photo up to 2 MiB.');
   const content=file?await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Photo could not be read.'));reader.readAsDataURL(file);
   }):null;
   await save(content);setMessage(file?'Photo saved.':'Photo removed.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="photo-control"><label className="field">{label}
 <input type="file" disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void update(file);}}/></label>
 {photo&&<button className="text-button" type="button" disabled={busy} onClick={()=>void update(null)}>Remove photo</button>}
 <small role="status">{busy?'Saving photo…':message||'JPEG, PNG or WebP · up to 2 MiB'}</small></div>;
}
