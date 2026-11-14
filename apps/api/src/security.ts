import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { db, Context } from './db';
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export type AuthRequest=Request & {userId:string; csrf:string; sessionId:string; context:Context};
export const roles=['ADMIN','HR','EMPLOYEE','AUDITOR'] as const;
export function requireRole(c:Context,...allowed:string[]) {
 if(!allowed.includes(c.role)) throw new ForbiddenException('Your role does not permit this action.');
}
@Injectable()
export class SessionGuard implements CanActivate {
 async canActivate(ctx:ExecutionContext){
  const req=ctx.switchToHttp().getRequest<AuthRequest>();
  const raw=req.cookies?.hris_session;
  if(typeof raw!=='string' || raw.length!==64) throw new UnauthorizedException('Please sign in.');
  const s=await db.session.findUnique({where:{id:hash(raw)}});
  if(!s || s.expiresAt<new Date()) throw new UnauthorizedException('Your session has expired. Please sign in.');
  req.userId=s.userId;req.csrf=s.csrf;req.sessionId=s.id;
  if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers['x-csrf-token']!==s.csrf) throw new ForbiddenException('Invalid CSRF token. Refresh and try again.');
  return true;
 }
}
@Injectable()
export class TenantGuard extends SessionGuard {
 async canActivate(ctx:ExecutionContext){
  await super.canActivate(ctx);
  const req=ctx.switchToHttp().getRequest<AuthRequest>();
  const tenantId=req.headers['x-tenant-id'];
  if(typeof tenantId!=='string' || !/^[0-9a-f-]{36}$/i.test(tenantId)) throw new ForbiddenException('Select an organization.');
  const m=await db.membership.findUnique({where:{tenantId_userId:{tenantId,userId:req.userId}}});
  if(!m?.active) throw new ForbiddenException('Organization access denied.');
  req.context={tenantId,userId:req.userId,role:m.role};return true;
 }
}
