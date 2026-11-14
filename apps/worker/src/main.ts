import { config } from 'dotenv';
import { resolve } from 'node:path';
config({path:resolve(__dirname,'../../../.env')});
import { PrismaClient, Prisma } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
const db=new PrismaClient();
const redis=new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const connection={host:redis.hostname,port:Number(redis.port||6379),password:redis.password||undefined,username:redis.username||undefined,...(redis.protocol==='rediss:'?{tls:{}}:{})};
const queue=new Queue('hris-delivery',{connection,defaultJobOptions:{attempts:8,backoff:{type:'exponential',delay:2000},removeOnComplete:{age:86400},removeOnFail:{age:604800}}});
const smtp=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||1025),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}:{})});
async function inTenant<T>(tenantId:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>){return db.$transaction(async tx=>{await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;return fn(tx);});}
const worker=new Worker('hris-delivery',async job=>{
 if(job.name==='email'){
  const mail=await db.authMail.findUnique({where:{id:job.data.id}});if(!mail || mail.sentAt)return;
  await smtp.sendMail({from:process.env.MAIL_FROM || 'HRIS <no-reply@hris.local>',to:mail.email,subject:mail.subject,text:mail.body,messageId:`<${mail.id}@hris.local>`});
  // SMTP is at-least-once; a crash after delivery may repeat the same message.
  await db.authMail.update({where:{id:mail.id},data:{sentAt:new Date(),body:'[delivered; token removed]'}});
 }else{
  await inTenant(job.data.tenantId,async tx=>{
   const row=await tx.outbox.findUnique({where:{id:job.data.id}});if(!row || row.deliveredAt)return;
   const data=row.payload as {userId:string;message:string};
   const member=await tx.membership.findUnique({where:{tenantId_userId:{tenantId:row.tenantId,userId:data.userId}}});
   if(member?.active)await tx.notification.upsert({where:{sourceId:row.id},create:{tenantId:row.tenantId,sourceId:row.id,userId:data.userId,message:data.message},update:{}});
   await tx.outbox.update({where:{id:row.id},data:{deliveredAt:new Date()}});
  });
 }
},{connection,concurrency:4});
worker.on('failed',(job,error)=>console.error(JSON.stringify({event:'delivery_failed',jobId:job?.id,errorType:error.name})));
worker.on('error',error=>console.error(JSON.stringify({event:'worker_error',errorType:error.name})));
let stopping=false;
async function dispatch(){
 if(stopping)return;
 try{
  const mails=await db.authMail.findMany({where:{sentAt:null},take:100,orderBy:{createdAt:'asc'}});
  for(const m of mails)await queue.add('email',{id:m.id},{jobId:`email-${m.id}`});
  const tenants=await db.tenant.findMany({select:{id:true}});
  for(const tenant of tenants){
   const rows=await inTenant(tenant.id,tx=>tx.outbox.findMany({where:{deliveredAt:null},take:100,orderBy:{createdAt:'asc'}}));
   for(const row of rows)await queue.add('notification',{id:row.id,tenantId:tenant.id},{jobId:`notification-${row.id}`});
  }
  await db.rateLimit.deleteMany({where:{expiresAt:{lt:new Date()}}});
  await db.session.deleteMany({where:{expiresAt:{lt:new Date()}}});
  await db.authToken.deleteMany({where:{expiresAt:{lt:new Date()}}});
 }catch(error){console.error(JSON.stringify({event:'dispatch_failed',type:error instanceof Error?error.name:'unknown'}));}
 if(!stopping)setTimeout(dispatch,3000);
}
async function start(){
 const role=await db.$queryRaw<Array<{rolsuper:boolean;rolbypassrls:boolean}>>`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
 if(role[0]?.rolsuper || role[0]?.rolbypassrls)throw new Error('Worker must use the restricted runtime database role.');
 console.log('HRIS worker ready. Polling durable outbox every 3 seconds.');await dispatch();
}
const stop=async()=>{stopping=true;await worker.close();await queue.close();await db.$disconnect();process.exit(0);};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
start().catch(e=>{console.error(e instanceof Error?e.message:'Startup failed');process.exit(1);});
