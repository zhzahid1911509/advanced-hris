import 'dotenv/config';
import { Queue } from 'bullmq';
const url=new URL(process.env.REDIS_URL||'redis://localhost:6379');
const queue=new Queue('hris-delivery',{connection:{host:url.hostname,port:Number(url.port||6379),password:url.password||undefined,username:url.username||undefined,...(url.protocol==='rediss:'?{tls:{}}:{})}});
const id=process.argv[2];if(!id)throw new Error('Usage: node scripts/retry-delivery.mjs <job-id>');
const job=await queue.getJob(id);if(!job)throw new Error('Job not found.');
if(await job.getState()!=='failed')throw new Error('Only failed jobs can be retried.');
await job.retry();await queue.close();console.log('Delivery retry queued.');
