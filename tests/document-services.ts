import {createServer as tcp} from 'node:net';
import {createServer as http} from 'node:http';
import type {AddressInfo} from 'node:net';
import {once} from 'node:events';

export async function documentServices(){
 const state={verdict:'unavailable',storageOffline:false};
 const objects=new Map<string,Buffer>();
 const scanner=tcp(socket=>{
  let packet=Buffer.alloc(0);
  socket.on('data',data=>{
   packet=Buffer.concat([packet,data]);
   if(packet.length<13)return;
   const size=packet.readUInt32BE(10);
   if(packet.length<18+size)return;
   socket.end(state.verdict==='clean'?'stream: OK\0':state.verdict==='reject'?'stream: fixture FOUND\0':'stream: unavailable ERROR\0');
  });
 });
 const store=http(async(req,res)=>{
  const key=(req.url??'').split('?')[0];
  if(state.storageOffline){res.writeHead(503).end();return;}
  if(req.method==='PUT'){
   const chunks=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   objects.set(key,Buffer.concat(chunks));res.writeHead(200).end();return;
  }
  const data=objects.get(key);res.writeHead(data?200:404).end(data);
 });
 scanner.listen(0,'127.0.0.1');await once(scanner,'listening');
 store.listen(0,'127.0.0.1');await once(store,'listening');
 return {state,objects,env:{DOCUMENT_CLAMD_HOST:'127.0.0.1',DOCUMENT_CLAMD_PORT:String((scanner.address() as AddressInfo).port),
 DOCUMENT_S3_ENDPOINT:'http://127.0.0.1:'+(store.address() as AddressInfo).port,DOCUMENT_S3_REGION:'us-east-1',DOCUMENT_S3_BUCKET:'fixture',
 DOCUMENT_S3_KEY:'test',DOCUMENT_S3_SECRET:'test-secret'},close(){scanner.close();store.close();}};
}
