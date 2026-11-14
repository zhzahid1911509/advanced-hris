import './config';
import { PrismaClient, Prisma } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
export const db=new PrismaClient();
export type Tx=Prisma.TransactionClient;
export type Context={userId:string;tenantId:string;role:string};
export async function tenantTx<T>(c:Context,fn:(tx:Tx)=>Promise<T>):Promise<T> {
 return db.$transaction(async tx=>{
  const membership=await tx.membership.findUnique({where:{tenantId_userId:{tenantId:c.tenantId,userId:c.userId}}});
  if(!membership?.active || membership.role!==c.role) throw new ForbiddenException('Membership has changed. Refresh and try again.');
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`;
  return fn(tx);
 },{timeout:10000});
}
export async function audit(tx:Tx,c:Context,action:string,entityId:string,detail:Prisma.InputJsonValue={}) {
 await tx.auditEvent.create({data:{tenantId:c.tenantId,actorId:c.userId,action,entityId,detail}});
}
export async function event(tx:Tx,c:Context,employeeId:string,kind:string,detail:string) {
 await tx.employeeEvent.create({data:{tenantId:c.tenantId,actorId:c.userId,employeeId,kind,detail}});
}
export async function notify(tx:Tx,c:Context,userId:string,message:string) {
 await tx.outbox.create({data:{tenantId:c.tenantId,kind:'notification',payload:{userId,message}}});
}
