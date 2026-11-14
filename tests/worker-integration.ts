import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Queue } from 'bullmq';
const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
async function main(){
 await db.connect();const tenant=randomUUID(),user=randomUUID(),outbox=randomUUID(),mail=randomUUID();
 const redis=new URL(process.env.REDIS_URL||'redis://localhost:6379');
 const queue=new Queue('hris-delivery',{connection:{host:redis.hostname,port:Number(redis.port||6379),password:redis.password||undefined}});
 try{
  await db.query('INSERT INTO tenants (id,name,slug) VALUES ($1,$2,$3)',[tenant,'Worker test',tenant]);
  await db.query('INSERT INTO users (id,name,email,"passwordHash",verified) VALUES ($1,$2,$3,$4,true)',[user,'Worker test',`${user}@example.test`,'not-a-login-account']);
  await db.query('INSERT INTO memberships (id,"tenantId","userId",role) VALUES ($1,$2,$3,$4)',[randomUUID(),tenant,user,'EMPLOYEE']);
  await db.query('INSERT INTO outbox (id,"tenantId",kind,payload) VALUES ($1,$2,$3,$4)',[outbox,tenant,'notification',JSON.stringify({userId:user,message:'Worker integration check'})]);
  await db.query('INSERT INTO auth_mail (id,email,subject,body) VALUES ($1,$2,$3,$4)',[mail,`${user}@example.test`,'Worker integration check','Synthetic test email.']);
  let delivered=false;
  for(let i=0;i<60;i++){
   const row=await db.query('SELECT "sentAt" FROM auth_mail WHERE id=$1',[mail]);const notice=await db.query('SELECT id FROM notifications WHERE "sourceId"=$1',[outbox]);
   if(row.rows[0]?.sentAt && notice.rowCount===1){delivered=true;break;}await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(delivered,'Worker must deliver both SMTP message and notification');console.log('PASS SMTP accepted and in-app notification persisted');
  await queue.add('notification',{id:outbox,tenantId:tenant},{jobId:'replay-'+outbox,removeOnComplete:true});
  for(let i=0;i<30;i++){if(!await queue.getJob('replay-'+outbox))break;await new Promise(r=>setTimeout(r,100));}
  const count=await db.query('SELECT count(*)::int n FROM notifications WHERE "sourceId"=$1',[outbox]);assert.equal(count.rows[0].n,1);console.log('PASS replayed outbox notification does not duplicate delivery');
  const wiped=await db.query('SELECT body FROM auth_mail WHERE id=$1',[mail]);assert.equal(wiped.rows[0].body,'[delivered; token removed]');console.log('PASS successful email body is redacted');
 }finally{await queue.close();await db.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
