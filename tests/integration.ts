import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
const owner=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
const runtime=new pg.Client({connectionString:process.env.DATABASE_URL});
const origin='http://localhost:3000';
const base='http://127.0.0.1:4101/api/v1/';const second='http://127.0.0.1:4102/api/v1/';
let checks=0;
function check(label:string,fn:()=>void){fn();checks++;console.log('PASS '+label);}
type Session={cookie:string;csrf:string;tenant:string;userId:string};
async function request(path:string,method='GET',body?:unknown,s?:Session,target=base){
 const r=await fetch(target+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(s?{Cookie:s.cookie,'x-csrf-token':s.csrf,'x-tenant-id':s.tenant}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const json=await r.json();return {status:r.status,json,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
}
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(base+'health');const s=await fetch(second+'health');if(r.ok&&s.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('API processes did not start.');}
async function getToken(email:string,action:string){const r=await owner.query('SELECT body FROM auth_mail WHERE email=$1 ORDER BY "createdAt" DESC LIMIT 1',[email]);const match=r.rows[0]?.body.match(new RegExp('action='+action+'&token=([a-f0-9]+)'));assert.ok(match,'Expected email token');return match[1];}
async function login(email:string,password:string){const l=await request('auth/login','POST',{email,password});assert.equal(l.status,201,JSON.stringify(l.json));const m=await fetch(base+'auth/me',{headers:{Cookie:l.cookie}});const me=await m.json();return {cookie:l.cookie,csrf:me.csrf,tenant:me.organizations[0].id,userId:me.user.id} as Session;}
async function main(){
 if(!process.env.MIGRATION_DATABASE_URL || !process.env.DATABASE_URL)throw new Error('Set migration and runtime database URLs. Run against a dedicated test database.');
 await owner.connect();await runtime.connect();
 const servers=[4101,4102].map(port=>spawn(process.execPath,['apps/api/dist/main.js'],{env:{...process.env,API_PORT:String(port),APP_ORIGIN:origin,REGISTRATION_ENABLED:'true',NODE_ENV:'test'},stdio:['ignore','pipe','pipe']}));
 for(const p of servers)p.stderr.on('data',d=>process.stderr.write(d));
 const prefix=randomUUID().slice(0,8);const password='Testing-HRIS-long-password!';
 try{
  await wait();
  // Clean only expired/global limiter counters in the dedicated test environment.
  await owner.query('DELETE FROM rate_limits');
  const aEmail=`admin-a-${prefix}@example.test`,bEmail=`admin-b-${prefix}@example.test`;
  let res=await request('employees');check('anonymous requests denied',()=>assert.equal(res.status,401));
  const badOrigin=await fetch(base+'auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test'},body:'{}'});check('cross-origin mutations rejected',()=>assert.equal(badOrigin.status,403));
  for(const [email,slug] of [[aEmail,'a-'+prefix],[bEmail,'b-'+prefix]]){
   res=await request('auth/register','POST',{name:'Test Administrator',email,password,organization:'Test Company '+slug,slug});assert.equal(res.status,201,JSON.stringify(res.json));
   res=await request('auth/login','POST',{email,password});check('unverified account cannot sign in',()=>assert.equal(res.status,403));
   const t=await getToken(email,'verify');res=await request('auth/verify','POST',{token:t});assert.equal(res.status,201);
   res=await request('auth/verify','POST',{token:t});check('verification token cannot be replayed',()=>assert.equal(res.status,400));
  }
  const a=await login(aEmail,password),b=await login(bEmail,password);
  res=await request('employees','GET',undefined,{...a,tenant:b.tenant});check('forged tenant header denied',()=>assert.equal(res.status,403));
  res=await request('units','POST',{name:'Dhaka',kind:'BRANCH'},{...a,csrf:'invalid'});check('invalid CSRF token rejected',()=>assert.equal(res.status,403));
  const unitA=await request('units','POST',{name:'Dhaka',kind:'BRANCH'},a);assert.equal(unitA.status,201);
  const unitB=await request('units','POST',{name:'Chattogram',kind:'BRANCH'},b);assert.equal(unitB.status,201);
  const employee={employeeNo:'EMP-001',name:'Test Employee',email:`employee-${prefix}@example.test`,title:'Software Engineer',category:'PERMANENT',status:'ACTIVE',joinedOn:'2026-01-01',branchId:unitA.json.id,departmentId:null,phone:'01700000000',address:'Dhaka',emergencyContact:'Contact 01'};
  res=await request('employees','POST',{...employee,branchId:unitB.json.id},a);check('cross-tenant organization assignment rejected',()=>assert.equal(res.status,400));
  const created=await request('employees','POST',employee,a);assert.equal(created.status,201,JSON.stringify(created.json));const id=created.json.id;
  res=await request('employees/'+id,'GET',undefined,b);check('guessed employee ID from another tenant is hidden',()=>assert.equal(res.status,404));
  res=await request('employees','GET',undefined,b);check('other tenant directory stays empty',()=>assert.equal(res.json.total,0));
  res=await request('employees','POST',employee,a);check('duplicate employee identifiers rejected',()=>assert.equal(res.status,409));
  const updated=await request('employees/'+id,'PATCH',{...employee,title:'Senior Engineer',version:1,reason:'Role updated for test'},a);assert.equal(updated.status,200);
  res=await request('employees/'+id,'PATCH',{...employee,version:1,reason:'Stale update attempt'},a);check('optimistic version prevents stale overwrite',()=>assert.equal(res.status,409));
  res=await request('employees/'+id+'/invite','POST',{role:'EMPLOYEE'},a);assert.equal(res.status,201);
  const invite=await getToken(employee.email,'invite');res=await request('auth/accept-invite','POST',{token:invite,name:employee.name,password});assert.equal(res.status,201,JSON.stringify(res.json));
  const employeeSession=await login(employee.email,password);
  res=await request('employees','GET',undefined,employeeSession);check('employee sees only own profile',()=>assert.equal(res.json.total,1));
  res=await request('employees','POST',employee,employeeSession);check('employee cannot create coworkers',()=>assert.equal(res.status,403));
  res=await request('audit','GET',undefined,employeeSession);check('employee cannot read administrative audit',()=>assert.equal(res.status,403));
  const changes={phone:'01800000000',address:'Updated address',emergencyContact:'Updated contact'};
  res=await request('profile-requests','POST',{employeeId:id,version:2,changes},employeeSession);assert.equal(res.status,201,JSON.stringify(res.json));const rid=res.json.id;
  const before=await request('employees/'+id,'GET',undefined,a);check('pending request does not mutate employee',()=>assert.equal(before.json.phone,employee.phone));
  res=await request('profile-requests','POST',{employeeId:id,version:2,changes},employeeSession);check('one pending request per employee enforced',()=>assert.equal(res.status,409));
  res=await request('profile-requests/'+rid+'/decision','POST',{decision:'APPROVED',reason:'Self approval attempt'},employeeSession);check('employee cannot approve changes',()=>assert.equal(res.status,403));
  const decisions=await Promise.all([request('profile-requests/'+rid+'/decision','POST',{decision:'APPROVED',reason:'Contact details verified'},a),request('profile-requests/'+rid+'/decision','POST',{decision:'APPROVED',reason:'Duplicate approval attempt'},a,second)]);
  check('two API processes commit only one approval',()=>assert.deepEqual(decisions.map(d=>d.status).sort(),[201,409]));
  res=await request('employees/'+id,'GET',undefined,a);check('approved contact update applied once',()=>{assert.equal(res.json.phone,changes.phone);assert.equal(res.json.version,3);});
  const count=await owner.query('SELECT count(*)::int n FROM audit_events WHERE "tenantId"=$1 AND action=$2 AND "entityId"=$3',[a.tenant,'PROFILE_APPROVED',rid]);check('approval audit is written once',()=>assert.equal(count.rows[0].n,1));
  const outbox=await owner.query('SELECT count(*)::int n FROM outbox WHERE "tenantId"=$1',[a.tenant]);check('notification intents persist with transactions',()=>assert.equal(outbox.rows[0].n,2));
  const raw=await runtime.query('SELECT * FROM employees');check('RLS denies queries with no tenant context',()=>assert.equal(raw.rowCount,0));
  await runtime.query('BEGIN');await runtime.query("SELECT set_config('app.tenant_id',$1,true)",[b.tenant]);const visible=await runtime.query('SELECT * FROM employees');await runtime.query('COMMIT');check('RLS filters direct runtime SQL',()=>assert.equal(visible.rowCount,0));
  await runtime.query('BEGIN');await runtime.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenant]);
  let fkDenied=false;try{await runtime.query('UPDATE employees SET "branchId"=$1 WHERE id=$2',[unitB.json.id,id]);}catch{fkDenied=true;}await runtime.query('ROLLBACK');check('composite foreign key blocks cross-tenant relation in SQL',()=>assert.ok(fkDenied));
  let appendOnly=false;try{await runtime.query('DELETE FROM audit_events');}catch{appendOnly=true;}check('runtime cannot delete audit records',()=>assert.ok(appendOnly));
  const pending=await request('profile-requests','POST',{employeeId:id,version:3,changes},employeeSession);assert.equal(pending.status,201);
  await request('employees/'+id,'PATCH',{...employee,version:3,reason:'Update after request submitted'},a);
  res=await request('profile-requests/'+pending.json.id+'/decision','POST',{decision:'APPROVED',reason:'This should conflict'},a);check('approval detects stale underlying employee version',()=>assert.equal(res.status,409));
  const requestState=await owner.query('SELECT state FROM profile_requests WHERE id=$1',[pending.json.id]);check('stale approval rolls back request decision',()=>assert.equal(requestState.rows[0].state,'PENDING'));
  res=await request('profile-requests/'+pending.json.id+'/decision','POST',{decision:'REJECTED',reason:'Please resubmit current details'},a);assert.equal(res.status,201);
  // Prove independent review even when an employee has HR privileges.
  const membership=await owner.query('SELECT id FROM memberships WHERE "tenantId"=$1 AND "userId"=$2',[a.tenant,employeeSession.userId]);
  await request('members/'+membership.rows[0].id,'PATCH',{role:'HR',active:true},a);
  const selfRequest=await request('profile-requests','POST',{employeeId:id,version:4,changes},employeeSession);assert.equal(selfRequest.status,201);
  res=await request('profile-requests/'+selfRequest.json.id+'/decision','POST',{decision:'APPROVED',reason:'HR self approval attempt'},employeeSession);check('HR cannot approve own request',()=>assert.equal(res.status,400));
  await request('members/'+membership.rows[0].id,'PATCH',{role:'AUDITOR',active:true},a);
  res=await request('employees/'+id,'GET',undefined,employeeSession);check('auditor contact fields are masked by API',()=>{assert.equal(res.json.phone,undefined);assert.equal(res.json.emergencyContact,undefined);});
  await request('members/'+membership.rows[0].id,'PATCH',{role:'EMPLOYEE',active:false},a);
  res=await request('employees','GET',undefined,employeeSession);check('suspended membership loses access immediately',()=>assert.equal(res.status,403));
  await request('auth/forgot-password','POST',{email:bEmail});const reset=await getToken(bEmail,'reset');
  res=await request('auth/reset-password','POST',{token:reset,password:password+'new'});assert.equal(res.status,201);
  res=await request('auth/me','GET',undefined,b);check('password reset revokes existing sessions',()=>assert.equal(res.status,401));
  res=await request('auth/reset-password','POST',{token:reset,password:password+'new'});check('reset token cannot be replayed',()=>assert.equal(res.status,400));
  await request('auth/logout','POST',{},a);res=await request('auth/me','GET',undefined,a);check('logout invalidates session server-side',()=>assert.equal(res.status,401));
  console.log(`\n${checks} integration assertions passed against two API processes and PostgreSQL.`);
 }finally{
  for(const server of servers)server.kill('SIGTERM');
  await Promise.all(servers.map(s=>s.exitCode===null?once(s,'exit'):Promise.resolve()));
  await runtime.end();await owner.end();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
