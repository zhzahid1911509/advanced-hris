import 'dotenv/config';
import {scanPdf} from '../apps/api/src/document-storage';

async function main(){
  const probe=Buffer.from('HRIS scanner connectivity check.\n');
  const verdict=await scanPdf(probe);
  console.log('ClamAV verdict for harmless test bytes:',verdict);
  if(verdict!=='READY')process.exitCode=1;
  const required=['DOCUMENT_S3_ENDPOINT','DOCUMENT_S3_REGION','DOCUMENT_S3_BUCKET','DOCUMENT_S3_KEY','DOCUMENT_S3_SECRET'];
  const missing=required.filter(key=>!process.env[key]?.trim());
  if(missing.length){
    console.log('Missing settings for Neon storage:',missing.join(', '));
    process.exitCode=1;
  }else{
    console.log('All five Neon storage settings are present. Retry the existing document to verify the actual storage write.');
  }
}
main().catch(error=>{
  console.error('ClamAV probe failed:',error.code||error.name);
  process.exitCode=1;
});
