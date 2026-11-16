import {createConnection} from 'node:net';
import {S3Client,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {ServiceUnavailableException} from '@nestjs/common';

export async function scanPdf(bytes:Buffer):Promise<'READY'|'REJECTED'>{
  const host=process.env.DOCUMENT_CLAMD_HOST;
  if(!host) throw Object.assign(new Error('Scanner unavailable'),{code:'CLAMD_HOST_MISSING'});
  return new Promise((resolve,reject)=>{
    const socket=createConnection({host,port:Number(process.env.DOCUMENT_CLAMD_PORT||3310)});
    const timer=setTimeout(()=>socket.destroy(Object.assign(new Error('Scan timed out'),{code:'CLAMD_TIMEOUT'})),30000);
    let reply='';
    socket.on('connect',()=>{
      const size=Buffer.alloc(4);size.writeUInt32BE(bytes.length);
      socket.write(Buffer.concat([Buffer.from('zINSTREAM\0'),size,bytes,Buffer.alloc(4)]));
    });
    socket.on('data',(chunk:Buffer)=>{
      reply+=chunk.toString('utf8');
      if(reply.length>4096){socket.destroy(new Error('Invalid scanner response'));return;}
      if(!reply.includes('\0'))return;
      const verdict=reply.split('\0')[0];
      if(verdict==='stream: OK')resolve('READY');
      else if(/^stream: .+ FOUND$/.test(verdict))resolve('REJECTED');
      else reject(Object.assign(new Error('Incomplete scan'),{code:'CLAMD_NO_VERDICT'}));
      socket.destroy();
    });
    socket.on('error',reject);
    socket.on('close',()=>{clearTimeout(timer);reject(new Error('Scanner disconnected'));});
  });
}
function storage(){
  const {DOCUMENT_S3_BUCKET:Bucket,DOCUMENT_S3_ENDPOINT:endpoint,DOCUMENT_S3_KEY:accessKeyId,DOCUMENT_S3_SECRET:secretAccessKey}=process.env;
  if(!Bucket||!accessKeyId||!secretAccessKey) throw Object.assign(new ServiceUnavailableException('Document storage is unavailable.'),{code:'S3_CONFIG_MISSING'});
  const client=new S3Client({endpoint:endpoint||undefined,region:process.env.DOCUMENT_S3_REGION||'us-east-1',forcePathStyle:true,credentials:{accessKeyId,secretAccessKey},maxAttempts:2});
  return {client,Bucket};
}
export async function storeClean(key:string,data:Buffer){
  const {client,Bucket}=storage();
  try{await client.send(new PutObjectCommand({Bucket,Key:key,Body:data,ContentType:'application/pdf',ContentDisposition:'attachment'}));}
  finally{client.destroy();}
}
export async function downloadLink(key:string,name:string,disposition:'attachment'|'inline'='attachment'){
  const {client,Bucket}=storage();
  try{return await getSignedUrl(client,new GetObjectCommand({Bucket,Key:key,ResponseContentDisposition:disposition+'; filename="employee-document.pdf"; filename*=UTF-8\'\''+encodeURIComponent(name)}),{expiresIn:60});}
  finally{client.destroy();}
}
