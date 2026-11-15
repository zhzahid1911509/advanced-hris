import { CustomRoleController, resolveSelection, roleSelection } from './custom-roles';
import { assignableRoles, managerRoles, isManager, employeeScope } from './directory-access';
import { requireVerifiedSession } from './account-security';
import { Body, Controller, Get, Post, Patch, Param, Query, Req, UseGuards, Module, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { tenantTx, audit, event, notify, Tx, Context } from './db';
import { TenantGuard, AuthRequest, requireRole, hash, token } from './security';
import { employeeInput, profileInput, uuid, name, email } from './validation';
import { origin } from './config';
async function ownEmployee(tx:Tx,c:Context,id:string){
 const employee=await tx.employee.findFirst({where:{id,...await employeeScope(tx,c)}});
 if(!employee) throw new NotFoundException('Employee not found.');return employee;
}
async function validateUnits(tx:Tx,tenantId:string,branchId:string|null,departmentId:string|null){
 for(const [id,kind] of [[branchId,'BRANCH'],[departmentId,'DEPARTMENT']] as const){
  if(id && !await tx.orgUnit.findFirst({where:{id,tenantId,kind}})) throw new BadRequestException(`Invalid ${kind?.toLowerCase()}.`);
 }
}
@ApiTags('People and organization')
@Controller() @UseGuards(TenantGuard)
export class PeopleController {
 @Get('dashboard') async dashboard(@Req() req:AuthRequest){return tenantTx(req.context,async tx=>{
  const self=req.context.role==='EMPLOYEE' || isManager(req.context.role);const scope=await employeeScope(tx,req.context);
  const [employees,active,units,pending,recent]=await Promise.all([
   tx.employee.count({where:scope}),tx.employee.count({where:{...scope,status:'ACTIVE'}}),tx.orgUnit.count(),
   tx.profileRequest.count({where:{state:'PENDING',...(self?{requesterId:req.userId}:{})}}),
   tx.employee.findMany({where:scope,orderBy:{createdAt:'desc'},take:5,select:{id:true,name:true,title:true,employeeNo:true,status:true,joinedOn:true}})
  ]);return {employees,active,units,pending,recent};
 });}
 @Get('units') async units(@Req() req:AuthRequest){return tenantTx(req.context,tx=>tx.orgUnit.findMany({orderBy:[{kind:'asc'},{name:'asc'}]}));}
 @Post('units') async createUnit(@Req() req:AuthRequest,@Body() body:unknown){
  requireRole(req.context,'ADMIN','HR');const d=z.object({name,kind:z.enum(['BRANCH','DEPARTMENT'])}).strict().parse(body);
  return tenantTx(req.context,async tx=>{const u=await tx.orgUnit.create({data:{...d,tenantId:req.context.tenantId}});await audit(tx,req.context,'ORG_UNIT_CREATED',u.id,{kind:d.kind});return u;});
 }
 @Patch('units/:id') async renameUnit(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  requireRole(req.context,'ADMIN','HR');uuid.parse(id);const d=z.object({name}).strict().parse(body);
  return tenantTx(req.context,async tx=>{const u=await tx.orgUnit.update({where:{id},data:d});await audit(tx,req.context,'ORG_UNIT_RENAMED',id);return u;});
 }
 @Get('employees') async employees(@Req() req:AuthRequest,@Query() query:unknown){
  const q=z.object({search:z.string().max(100).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(query);
  return tenantTx(req.context,async tx=>{
   const where={AND:[await employeeScope(tx,req.context)],OR:[{name:{contains:q.search,mode:'insensitive' as const}},{employeeNo:{contains:q.search,mode:'insensitive' as const}},{title:{contains:q.search,mode:'insensitive' as const}}]};
   const [items,total]=await Promise.all([tx.employee.findMany({where,skip:(q.page-1)*20,take:20,orderBy:{name:'asc'},select:{id:true,employeeNo:true,name:true,title:true,email:true,status:true,category:true,branchId:true,departmentId:true,joinedOn:true,version:true}}),tx.employee.count({where})]);
   return {items,total,page:q.page,pageSize:20};
  });
 }
 @Get('employees/:id') async employee(@Req() req:AuthRequest,@Param('id') id:string){uuid.parse(id);return tenantTx(req.context,async tx=>{
  const e=await ownEmployee(tx,req.context,id);
  const manager=req.context.role==='ADMIN' && e.managerId
   ? await tx.employee.findFirst({where:{id:e.managerId,tenantId:req.context.tenantId},select:{employeeNo:true,name:true}})
   : null;
  const timeline=await tx.employeeEvent.findMany({where:{employeeId:id},orderBy:{createdAt:'desc'},take:50});
  // Auditors can inspect events and employment metadata but not private contact fields.
  if (isManager(req.context.role)) {
   const policy=req.context.directoryRole ?? await tx.directoryPolicy.findUnique({where:{tenantId_role:{tenantId:req.context.tenantId,role:req.context.role}}});
   return {...e,managerId:undefined,address:undefined,emergencyContact:undefined,phone:policy?.showPhone?e.phone:undefined,timeline:[]};
  }
  return {...e,manager,managerId:undefined,...(req.context.role==='AUDITOR'?{phone:undefined,address:undefined,emergencyContact:undefined}:{}),timeline};
 });}
 @Post('employees') async create(@Req() req:AuthRequest,@Body() body:unknown){
  requireRole(req.context,'ADMIN','HR');const d=employeeInput.parse(body);
  return tenantTx(req.context,async tx=>{
   await validateUnits(tx,req.context.tenantId,d.branchId,d.departmentId);
   const e=await tx.employee.create({data:{...d,joinedOn:new Date(d.joinedOn+'T00:00:00Z'),tenantId:req.context.tenantId}});
   await event(tx,req.context,e.id,'CREATED','Employee record created');await audit(tx,req.context,'EMPLOYEE_CREATED',e.id,{employeeNo:e.employeeNo});return e;
  });
 }
 @Patch('employees/:id') async update(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  requireRole(req.context,'ADMIN','HR');uuid.parse(id);
  const d=employeeInput.extend({version:z.number().int().positive(),reason:z.string().trim().min(5).max(300)}).parse(body);
  return tenantTx(req.context,async tx=>{
   const before=await ownEmployee(tx,req.context,id);await validateUnits(tx,req.context.tenantId,d.branchId,d.departmentId);
   if(before.userId && before.email!==d.email) throw new BadRequestException('Linked account email changes are not supported in this release.');
   const {version,reason,...fields}=d;
   const result=await tx.employee.updateMany({where:{id,version},data:{...fields,joinedOn:new Date(d.joinedOn+'T00:00:00Z'),version:{increment:1}}});
   if(result.count!==1) throw new ConflictException('This record changed. Refresh before saving.');
   const changed=Object.keys(fields).filter(k=>k!=='joinedOn' && (before as any)[k] !== (fields as any)[k]);
   if(before.joinedOn.toISOString().slice(0,10)!==fields.joinedOn)changed.push('joinedOn');
   await event(tx,req.context,id,'UPDATED',reason);
   await audit(tx,req.context,'EMPLOYEE_UPDATED',id,{fields:changed,reason,previousVersion:version,newVersion:version+1});
   return tx.employee.findUniqueOrThrow({where:{id}});
  });
 }
 @Patch('employees/:id/reporting-line')
 async setManager(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  requireRole(req.context,'ADMIN');
  await requireVerifiedSession(req);
  uuid.parse(id);
  const input=z.object({managerEmployeeNo:z.string().trim().min(1).max(30).nullable(),version:z.number().int().positive()}).strict().parse(body);
  return tenantTx(req.context,async tx=>{
   const tenantId=req.context.tenantId;
   // Serialize hierarchy changes to prevent two concurrent edits from forming a cycle.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 1794))`;
   const employee=await tx.employee.findFirst({where:{tenantId,id}});
   if(!employee) throw new NotFoundException('Employee not found.');
   if(employee.version!==input.version) throw new ConflictException('Reopen the profile before changing the reporting line.');
   let managerId:string|null=null;
   if(input.managerEmployeeNo!==null){
    const manager=await tx.employee.findFirst({where:{tenantId,employeeNo:input.managerEmployeeNo},select:{id:true}});
    if(!manager) throw new NotFoundException('Manager employee number not found in this workspace.');
    managerId=manager.id;
    const cycle=await tx.$queryRaw<{id:string}[]>`
      WITH RECURSIVE chain AS (
        SELECT id,"managerId" FROM employees WHERE "tenantId"=${tenantId}::uuid AND id=${managerId}::uuid
        UNION
        SELECT e.id,e."managerId" FROM employees e JOIN chain c ON e.id=c."managerId"
        WHERE e."tenantId"=${tenantId}::uuid
      ) SELECT id FROM chain WHERE id=${id}::uuid`;
    if(cycle.length) throw new BadRequestException('This assignment would create a reporting cycle.');
   }
   if(managerId===employee.managerId) return {version:employee.version};
   const updated=await tx.employee.updateMany({where:{tenantId,id,version:input.version},data:{managerId,version:{increment:1}}});
   if(!updated.count) throw new ConflictException('Reopen the profile before changing the reporting line.');
   await audit(tx,req.context,'REPORTING_LINE_CHANGED',id,{previousManagerId:employee.managerId,managerId});
   return {version:input.version+1};
  });
 }
 @Post('employees/:id/invite') async invite(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  requireRole(req.context,'ADMIN');await requireVerifiedSession(req);uuid.parse(id);const d=z.object({role:roleSelection}).strict().parse(body);
  return tenantTx(req.context,async tx=>{
   const e=await ownEmployee(tx,req.context,id);if(e.userId)throw new ConflictException('Employee already has an account.');
   const raw=token();await tx.authToken.deleteMany({where:{tenantId:req.context.tenantId,employeeId:id,kind:'INVITE'}});
   const selection=await resolveSelection(tx,req.context.tenantId,d.role);
   await tx.authToken.create({data:{id:hash(raw),email:e.email,tenantId:req.context.tenantId,employeeId:id,kind:'INVITE',...selection,expiresAt:new Date(Date.now()+48*3600000)}});
   await tx.authMail.create({data:{email:e.email,subject:'Your HRIS invitation',body:`You have been invited to HRIS.\n\n${origin}/?action=invite&token=${raw}\n\nThis link expires in 48 hours. Existing users must enter their current password.`}});
   await audit(tx,req.context,'EMPLOYEE_INVITED',id,{role:d.role});return {message:'Invitation queued for email delivery.'};
  });
 }
 @Post('profile-requests') async request(@Req() req:AuthRequest,@Body() body:unknown){
  const d=z.object({employeeId:uuid,version:z.number().int().positive(),changes:profileInput}).strict().parse(body);
  return tenantTx(req.context,async tx=>{
   const e=await tx.employee.findFirst({where:{id:d.employeeId,userId:req.userId}});if(!e)throw new NotFoundException('Your linked employee record was not found.');
   if(e.version!==d.version)throw new ConflictException('Refresh your profile before submitting.');
   const r=await tx.profileRequest.create({data:{tenantId:req.context.tenantId,employeeId:e.id,requesterId:req.userId,baseVersion:e.version,changes:d.changes}});
   await audit(tx,req.context,'PROFILE_CHANGE_REQUESTED',r.id,{fields:Object.keys(d.changes)});
   const reviewers=await tx.membership.findMany({where:{tenantId:req.context.tenantId,role:{in:['ADMIN','HR']},active:true}});
   for(const reviewer of reviewers) await notify(tx,req.context,reviewer.userId,`A profile change for ${e.name} needs review.`);
   return r;
  });
 }
 @Get('profile-requests') async requests(@Req() req:AuthRequest){return tenantTx(req.context,async tx=>{
  const requests=await tx.profileRequest.findMany({where:(req.context.role==='EMPLOYEE'||isManager(req.context.role))?{requesterId:req.userId}:{},orderBy:{createdAt:'desc'},take:100});
  const employees=await tx.employee.findMany({where:{id:{in:requests.map(r=>r.employeeId)}},select:{id:true,name:true}});
  return requests.map(r=>({...r,employeeName:employees.find(e=>e.id===r.employeeId)?.name,...(req.context.role==='AUDITOR'?{changes:undefined}:{})}));
 });}
 @Post('profile-requests/:id/decision') async decision(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  requireRole(req.context,'ADMIN','HR');uuid.parse(id);const d=z.object({decision:z.enum(['APPROVED','REJECTED']),reason:z.string().trim().min(5).max(300)}).strict().parse(body);
  return tenantTx(req.context,async tx=>{
   const r=await tx.profileRequest.findUnique({where:{id}});if(!r)throw new NotFoundException();
   if(r.requesterId===req.userId)throw new BadRequestException('You cannot approve or reject your own request.');
   const locked=await tx.profileRequest.updateMany({where:{id,state:'PENDING'},data:{state:d.decision,reason:d.reason,reviewerId:req.userId,reviewedAt:new Date()}});
   if(locked.count!==1)throw new ConflictException('This request has already been reviewed.');
   if(d.decision==='APPROVED'){
    const changes=profileInput.parse(r.changes);
    const changed=await tx.employee.updateMany({where:{id:r.employeeId,version:r.baseVersion},data:{...changes,version:{increment:1}}});
    if(changed.count!==1)throw new ConflictException('Employee changed since submission. Reject this request and ask for a new one.');
    await event(tx,req.context,r.employeeId,'PROFILE_APPROVED','Approved employee contact update');
   }
   await audit(tx,req.context,'PROFILE_'+d.decision,id,{reason:d.reason});
   await notify(tx,req.context,r.requesterId,`Your profile change was ${d.decision.toLowerCase()}.`);
   return {message:'Decision recorded.'};
  });
 }
 @Get('audit') async audits(@Req() req:AuthRequest){requireRole(req.context,'ADMIN','HR','AUDITOR');return tenantTx(req.context,tx=>tx.auditEvent.findMany({orderBy:{createdAt:'desc'},take:100}));}
 @Get('notifications') async notifications(@Req() req:AuthRequest){return tenantTx(req.context,tx=>tx.notification.findMany({where:{userId:req.userId},orderBy:{createdAt:'desc'},take:50}));}
 @Post('notifications/:id/read') async read(@Req() req:AuthRequest,@Param('id') id:string){uuid.parse(id);return tenantTx(req.context,async tx=>{await tx.notification.updateMany({where:{id,userId:req.userId},data:{readAt:new Date()}});return {message:'Marked as read.'};});}
 @Get('directory-policies') async policies(@Req() req:AuthRequest){
  requireRole(req.context,'ADMIN');
  return tenantTx(req.context,async tx=>{
   const rows=await tx.directoryPolicy.findMany({where:{tenantId:req.context.tenantId}});
   return managerRoles.map(role=>({role,showPhone:rows.find(row=>row.role===role)?.showPhone??false}));
  });
 }
 @Patch('directory-policies/:role') async changePolicy(@Req() req:AuthRequest,@Param('role') raw:string,@Body() body:unknown){
  requireRole(req.context,'ADMIN');await requireVerifiedSession(req);
  const role=z.enum(managerRoles).parse(raw);
  const {showPhone}=z.object({showPhone:z.boolean()}).strict().parse(body);
  return tenantTx(req.context,async tx=>{
   const tenantId=req.context.tenantId;
   await tx.directoryPolicy.upsert({where:{tenantId_role:{tenantId,role}},create:{tenantId,role,showPhone},update:{showPhone}});
   await audit(tx,req.context,'DIRECTORY_POLICY_CHANGED',tenantId,{role,showPhone});
   return {role,showPhone};
  });
 }
 @Get('members') async members(@Req() req:AuthRequest){requireRole(req.context,'ADMIN');return tenantTx(req.context,async tx=>{
  const ms=await tx.membership.findMany({where:{tenantId:req.context.tenantId}});
  const users=await tx.user.findMany({where:{id:{in:ms.map(m=>m.userId)}},select:{id:true,name:true,email:true}});
  return ms.map(m=>({...m,user:users.find(u=>u.id===m.userId)}));
 });}
 @Patch('members/:id') async changeMember(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  requireRole(req.context,'ADMIN');await requireVerifiedSession(req);uuid.parse(id);const d=z.object({role:roleSelection,active:z.boolean()}).strict().parse(body);
  return tenantTx(req.context,async tx=>{
   const m=await tx.membership.findFirst({where:{id,tenantId:req.context.tenantId}});if(!m)throw new NotFoundException();
   if(m.role==='ADMIN' || m.userId===req.userId)throw new BadRequestException('Administrator and self-access changes are not supported.');
   const selection=await resolveSelection(tx,req.context.tenantId,d.role);
   await tx.membership.update({where:{id},data:{...selection,active:d.active}});await audit(tx,req.context,'MEMBERSHIP_CHANGED',id,d);return {message:'Access updated. It takes effect on the next request.'};
  });
 }
}
@Module({controllers:[PeopleController,CustomRoleController]}) export class PeopleModule {}
