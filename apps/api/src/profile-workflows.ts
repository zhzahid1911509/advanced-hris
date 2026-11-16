import {BadRequestException,Body,Controller,Get,Post,Req,UseGuards,ConflictException} from '@nestjs/common';
import {z} from 'zod';
import {audit,tenantTx,type Tx} from './db';
import {TenantGuard,requireRole,type AuthRequest} from './security';
import {requireVerifiedSession} from './account-security';

export const modes=z.enum(['EITHER','HR_THEN_ADMIN','BOTH','EMERGENCY_CHANGE']);
export type Candidate={userId:string;role:string};
export type Review=Candidate & {decision:string;reason:string;at:string};

export async function currentPolicy(tx:Tx,tenantId:string){
 return await tx.profileWorkflow.findFirst({where:{tenantId},orderBy:{version:'desc'}})??{version:1,mode:'EITHER'};
}
export function neededRoles(mode:string,reviews:Review[]){
 if(mode==='EITHER')return ['HR','ADMIN'];
 const remaining=['HR','ADMIN'].filter(role=>!reviews.some(r=>r.role===role));
 return mode==='HR_THEN_ADMIN'?remaining.slice(0,1):remaining;
}
export function validateStaff(mode:string,candidates:Candidate[]){
 if(!candidates.length || (mode!=='EITHER' && !['HR','ADMIN'].every(role=>candidates.some(c=>c.role===role))))
  throw new BadRequestException('This workflow needs independent active reviewers in each required role.');
}
@Controller('profile-workflow') @UseGuards(TenantGuard)
export class WorkflowController{
 @Get() read(@Req() req:AuthRequest){
  requireRole(req.context,'ADMIN');
  return tenantTx(req.context,tx=>currentPolicy(tx,req.context.tenantId));
 }
 @Post() async publish(@Req() req:AuthRequest,@Body() body:unknown){
  requireRole(req.context,'ADMIN');await requireVerifiedSession(req);
  const input=z.object({mode:modes,version:z.number().int().positive()}).strict().parse(body);
  return tenantTx(req.context,async tx=>{
   const tenantId=req.context.tenantId;
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 8195))`;
   const prior=await currentPolicy(tx,tenantId);
   if(prior.version!==input.version)throw new ConflictException('Refresh before publishing a new version.');
   validateStaff(input.mode,await tx.membership.findMany({where:{tenantId,active:true,role:{in:['ADMIN','HR']}},select:{role:true,userId:true}}));
   const policy=await tx.profileWorkflow.create({data:{tenantId,mode:input.mode,version:prior.version+1}});
   await audit(tx,req.context,'PROFILE_WORKFLOW_PUBLISHED',tenantId,{mode:policy.mode,version:policy.version});
   return policy;
  });
 }
}
