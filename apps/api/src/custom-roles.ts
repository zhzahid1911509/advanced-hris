import { Body, Controller, Get, Patch, Post, Param, Req, UseGuards, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { tenantTx, audit, type Tx } from './db';
import { requireVerifiedSession } from './account-security';
import { TenantGuard, requireRole, type AuthRequest } from './security';
import { assignableRoles } from './directory-access';

const definition=z.object({
  name:z.string().trim().min(2).max(70),
  scope:z.enum(['SELF','TEAM','BRANCH','DEPARTMENT','TENANT']),
  showPhone:z.boolean()
}).strict();

export const roleSelection=z.union([z.enum(assignableRoles),z.string().uuid()]);

export async function resolveSelection(tx:Tx,tenantId:string,value:string) {
  const builtIn=assignableRoles.some(role=>role===value);
  if (builtIn) return {role:value,customRoleId:null};
  const role=await tx.customRole.findFirst({where:{tenantId,id:value},select:{id:true}});
  if (!role) throw new NotFoundException('Workspace role not found.');
  return {role:'CUSTOM',customRoleId:role.id};
}

@Controller('custom-roles') @UseGuards(TenantGuard)
export class CustomRoleController {
  @Get() list(@Req() req:AuthRequest){
    requireRole(req.context,'ADMIN');
    return tenantTx(req.context,tx=>tx.customRole.findMany({
      where:{tenantId:req.context.tenantId},orderBy:{name:'asc'}
    }));
  }
  @Post() async create(@Req() req:AuthRequest,@Body() body:unknown){
    requireRole(req.context,'ADMIN');await requireVerifiedSession(req);
    const input=definition.parse(body);
    return tenantTx(req.context,async tx=>{
      const role=await tx.customRole.create({data:{...input,tenantId:req.context.tenantId}});
      await audit(tx,req.context,'CUSTOM_ROLE_CREATED',role.id,input);
      return role;
    });
  }
  @Post(':id/remove') async remove(@Req() req:AuthRequest,@Param('id') raw:string,@Body() body:unknown){
    requireRole(req.context,'ADMIN');await requireVerifiedSession(req);
    const id=z.string().uuid().parse(raw);
    const {version}=z.object({version:z.number().int().positive()}).strict().parse(body);
    try {
      return await tenantTx(req.context,async tx=>{
        const tenantId=req.context.tenantId;
        await tx.authToken.deleteMany({where:{tenantId,customRoleId:id,expiresAt:{lte:new Date()}}});
        const result=await tx.customRole.deleteMany({where:{tenantId,id,version}});
        if (!result.count) throw new ConflictException('Role unavailable or changed. Refresh and try again.');
        await audit(tx,req.context,'CUSTOM_ROLE_REMOVED',id,{version});
        return {id};
      });
    } catch(error){
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2003') {
        throw new ConflictException('Reassign members and resolve outstanding invitations before removing this role.');
      }
      throw error;
    }
  }
  @Patch(':id') async edit(@Req() req:AuthRequest,@Param('id') raw:string,@Body() body:unknown){
    requireRole(req.context,'ADMIN');await requireVerifiedSession(req);
    const id=z.string().uuid().parse(raw);
    const {version,...input}=definition.extend({version:z.number().int().positive()}).parse(body);
    return tenantTx(req.context,async tx=>{
      const result=await tx.customRole.updateMany({where:{tenantId:req.context.tenantId,id,version},data:{...input,version:{increment:1}}});
      if (!result.count) throw new ConflictException('Role unavailable or changed. Refresh and try again.');
      await audit(tx,req.context,'CUSTOM_ROLE_CHANGED',id,{...input,version:version+1});
      return {id,...input,version:version+1};
    });
  }
}
