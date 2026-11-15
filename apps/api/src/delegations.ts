import {BadRequestException, ConflictException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards} from '@nestjs/common';
import {z} from 'zod';
import {audit, tenantTx, type Context} from './db';
import {employeeScope} from './directory-access';
import {requireVerifiedSession} from './account-security';
import {TenantGuard, type AuthRequest} from './security';

const unavailable=()=>new NotFoundException('Delegated profile unavailable.');
const publicFields={employeeNo:true,name:true,title:true,email:true,status:true} as const;

@Controller('delegations') @UseGuards(TenantGuard)
export class DelegationController {
  @Post() async create(@Req() req:AuthRequest,@Body() body:unknown) {
    await requireVerifiedSession(req);
    const input=z.object({employeeNo:z.string().trim().min(1).max(30),recipientEmail:z.string().trim().email().toLowerCase(),expiresAt:z.string().datetime()}).strict().parse(body);
    const expiresAt=new Date(input.expiresAt);
    if(expiresAt.getTime()<=Date.now()) throw new BadRequestException('Choose a future expiration.');
    return tenantTx(req.context,async tx=>{
      const {tenantId,userId}=req.context;
      const employee=await tx.employee.findFirst({where:{AND:[await employeeScope(tx,req.context)],employeeNo:input.employeeNo},select:{id:true}});
      if(!employee) throw unavailable();
      const recipient=await tx.user.findUnique({where:{email:input.recipientEmail},select:{id:true}});
      const member=recipient && await tx.membership.findUnique({where:{tenantId_userId:{tenantId,userId:recipient.id}}});
      if(!member?.active) throw new BadRequestException('Choose an active member of this workspace.');
      if(member.userId===userId) throw new BadRequestException('Choose another member.');
      const grantKey=[tenantId,userId,member.userId,employee.id].join('/');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${grantKey}, 6194))`;
      const existing=await tx.directoryDelegation.findFirst({where:{tenantId,grantorId:userId,recipientId:member.userId,employeeId:employee.id,revokedAt:null,expiresAt:{gt:new Date()}}});
      if(existing){
        if(existing.expiresAt.getTime()===expiresAt.getTime()) return {id:existing.id};
        throw new ConflictException('Revoke the existing grant before changing its expiration.');
      }
      const grant=await tx.directoryDelegation.create({data:{tenantId,grantorId:userId,recipientId:member.userId,employeeId:employee.id,expiresAt}});
      await audit(tx,req.context,'DIRECTORY_DELEGATED',grant.id,{employeeId:employee.id,recipientId:member.userId,expiresAt:expiresAt.toISOString()});
      return {id:grant.id};
    });
  }
  @Get() list(@Req() req:AuthRequest){
    return tenantTx(req.context,async tx=>{
      const {tenantId,userId}=req.context;
      const rows=await tx.directoryDelegation.findMany({where:{tenantId,OR:[{grantorId:userId},{recipientId:userId}]},orderBy:{createdAt:'desc'}});
      const ids=[...new Set(rows.map(r=>r.grantorId===userId?r.recipientId:r.grantorId))];
      const names=await tx.user.findMany({where:{id:{in:ids}},select:{id:true,name:true}});
      const people=new Map(names.map(u=>[u.id,u.name]));
      const sentIds=rows.filter(r=>r.grantorId===userId).map(r=>r.employeeId);
      const employees=await tx.employee.findMany({where:{tenantId,id:{in:sentIds}},select:{id:true,employeeNo:true}});
      const numbers=new Map(employees.map(e=>[e.id,e.employeeNo]));
      return rows.map(r=>({id:r.id,outgoing:r.grantorId===userId,other:people.get(r.grantorId===userId?r.recipientId:r.grantorId),
        expiresAt:r.expiresAt,revokedAt:r.revokedAt,employeeNo:r.grantorId===userId?numbers.get(r.employeeId):undefined}));
    });
  }
  @Get(':id/profile') read(@Req() req:AuthRequest,@Param('id') raw:string){
    const id=z.string().uuid().parse(raw);
    return tenantTx(req.context,async tx=>{
      const {tenantId,userId}=req.context;
      const grant=await tx.directoryDelegation.findFirst({where:{tenantId,id,recipientId:userId,revokedAt:null,expiresAt:{gt:new Date()}}});
      if(!grant) throw unavailable();
      const member=await tx.membership.findUnique({where:{tenantId_userId:{tenantId,userId:grant.grantorId}}});
      if(!member?.active) throw unavailable();
      const source:Context={tenantId,userId:member.userId,role:member.role};
      if(member.role==='CUSTOM'){
        const definition=await tx.customRole.findFirst({where:{tenantId,id:member.customRoleId!},select:{scope:true,showPhone:true}});
        if(!definition) throw unavailable();
        source.directoryRole=definition;
      }
      const profile=await tx.employee.findFirst({where:{AND:[await employeeScope(tx,source)],id:grant.employeeId},select:publicFields});
      if(!profile) throw unavailable();
      await audit(tx,req.context,'DELEGATED_PROFILE_VIEWED',id,{grantorId:member.userId,employeeId:grant.employeeId});
      return profile;
    });
  }
  @Post(':id/revoke') revoke(@Req() req:AuthRequest,@Param('id') raw:string){
    const id=z.string().uuid().parse(raw);
    return tenantTx(req.context,async tx=>{
      const where={tenantId:req.context.tenantId,id,grantorId:req.userId};
      const changed=await tx.directoryDelegation.updateMany({where:{...where,revokedAt:null},data:{revokedAt:new Date()}});
      if(changed.count) await audit(tx,req.context,'DIRECTORY_DELEGATION_REVOKED',id,{});
      else if(!await tx.directoryDelegation.findFirst({where,select:{id:true}})) throw unavailable();
      return {id};
    });
  }
}
