import { lockedUser, reserveAttempt, verifyFactor } from './account-security';
import { Body, Controller, Post, Get, Req, Res, UseGuards, ConflictException, BadRequestException, UnauthorizedException, ForbiddenException, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { db } from './db';
import { email, password, name } from './validation';
import { hash, token, SessionGuard, AuthRequest } from './security';
import { origin, secureCookie } from './config';
const cookie={httpOnly:true,secure:secureCookie,sameSite:'lax' as const,path:'/'};
const expiry=(hours:number)=>new Date(Date.now()+hours*3600000);
const generic={message:'If the account is eligible, an email will arrive shortly.'};
async function mail(tx:any,to:string,subject:string,path:string,secret:string){
 await tx.authMail.create({data:{email:to,subject,body:`${subject}\n\nOpen this link: ${origin}/?action=${path}&token=${secret}\n\nIf you did not request this, ignore this message.`}});
}
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
 @Post('register') @ApiOperation({summary:'Create an organization and send administrator verification email'})
 async register(@Body() body:unknown){
  if(process.env.REGISTRATION_ENABLED!=='true') throw new ForbiddenException('Registration is disabled. Contact your administrator.');
  const d=z.object({name,email,password,organization:name,slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(40)}).strict().parse(body);
  const passwordHash=await argon2.hash(d.password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
  const raw=token();
  await db.$transaction(async tx=>{
   if(await tx.user.findUnique({where:{email:d.email}})) throw new ConflictException('Unable to register. Use sign-in or password recovery for an existing account.');
   const user=await tx.user.create({data:{name:d.name,email:d.email,passwordHash}});
   const tenant=await tx.tenant.create({data:{name:d.organization,slug:d.slug}});
   await tx.membership.create({data:{userId:user.id,tenantId:tenant.id,role:'ADMIN'}});
   await tx.authToken.create({data:{id:hash(raw),email:d.email,userId:user.id,kind:'VERIFY',expiresAt:expiry(24)}});
   await mail(tx,d.email,'Verify your HRIS account','verify',raw);
  });
  return {message:'Organization created. Check your email to verify your account before signing in.'};
 }
 @Post('verify')
 async verify(@Body() body:unknown){
  const d=z.object({token:z.string().length(64)}).parse(body);
  await db.$transaction(async tx=>{
   const t=await tx.authToken.findUnique({where:{id:hash(d.token)}});
   if(!t || t.kind!=='VERIFY' || !t.userId || t.expiresAt<new Date()) throw new BadRequestException('Verification link is invalid or expired.');
   await tx.authToken.delete({where:{id:t.id}});
   await tx.user.update({where:{id:t.userId},data:{verified:true}});
  });return {message:'Email verified. You can now sign in.'};
 }
 @Post('resend-verification')
 async resend(@Body() body:unknown){
  const d=z.object({email}).parse(body); const u=await db.user.findUnique({where:{email:d.email}});
  if(u && !u.verified){const raw=token();await db.$transaction(async tx=>{
   await tx.authToken.deleteMany({where:{userId:u.id,kind:'VERIFY'}});
   await tx.authToken.create({data:{id:hash(raw),userId:u.id,email:u.email,kind:'VERIFY',expiresAt:expiry(24)}});
   await mail(tx,u.email,'Verify your HRIS account','verify',raw);
  });} return generic;
 }
 @Post('login')
 async login(@Body() body:unknown,@Req() req:AuthRequest,@Res({passthrough:true}) res:Response){
  const input = z.object({email,password:z.string().min(1).max(128),code:z.string().trim().max(48).optional()}).parse(body);
  const attempt = await reserveAttempt(input.email);
  const account = await db.user.findUnique({where:{email:input.email}});
  const dummy = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXJhbmRvbXNhbHQxMg$7VViVkFHNa/H9Wj+UqKK3WutxAZpETwYszY8Kxr1mxY';
  const valid = await argon2.verify(account?.passwordHash || dummy,input.password).catch(()=>false);
  if (!account || !valid) throw new UnauthorizedException('Email or password is incorrect.');
  if (!account.verified) throw new ForbiddenException('Verify your email before signing in.');
  const raw = token();
  const result = await db.$transaction(async tx=>{
    const user = await lockedUser(tx,account.id);
    if (user.passwordHash !== account.passwordHash) throw new UnauthorizedException('Sign in again with your current password.');
    if (user.mfaSecret && !input.code) return {requiresMfa:true} as const;
    if (user.mfaSecret) await verifyFactor(tx,user,input.code!);
    if (typeof req.cookies?.hris_session==='string') {
      await tx.session.deleteMany({where:{id:hash(req.cookies.hris_session)}});
    }
    const session = await tx.session.create({data:{
      id:hash(raw),userId:user.id,csrf:token(),expiresAt:expiry(12),
      agent:(req.get('user-agent') || '').slice(0,240),factorAt:user.mfaSecret?new Date():null
    }});
    await tx.rateLimit.deleteMany({where:{id:attempt}});
    return {csrf:session.csrf,user:{id:user.id,name:user.name,email:user.email}};
  });
  if (!('requiresMfa' in result)) res.cookie('hris_session',raw,{...cookie,maxAge:12*3600000});
  return result;
 }
 @Get('me') @UseGuards(SessionGuard)
 async me(@Req() req:AuthRequest){
  const [user,memberships]=await Promise.all([
   db.user.findUniqueOrThrow({where:{id:req.userId},select:{id:true,name:true,email:true,photo:true}}),
   db.membership.findMany({where:{userId:req.userId,active:true}})
  ]);
  const tenants=await db.tenant.findMany({where:{id:{in:memberships.map(m=>m.tenantId)}}});
  return {user,csrf:req.csrf,organizations:memberships.map(m=>({...tenants.find(t=>t.id===m.tenantId),role:m.role}))};
 }
 @Post('logout') @UseGuards(SessionGuard)
 async logout(@Req() req:AuthRequest,@Res({passthrough:true}) res:Response){await db.session.deleteMany({where:{id:req.sessionId}});res.clearCookie('hris_session',cookie);return {message:'Signed out.'};}
 @Post('logout-all') @UseGuards(SessionGuard)
 async logoutAll(@Req() req:AuthRequest,@Res({passthrough:true}) res:Response){await db.session.deleteMany({where:{userId:req.userId}});res.clearCookie('hris_session',cookie);return {message:'All sessions revoked.'};}
 @Post('forgot-password')
 async forgot(@Body() body:unknown){
  const d=z.object({email}).parse(body);const u=await db.user.findUnique({where:{email:d.email}});
  if(u){const raw=token();await db.$transaction(async tx=>{
   await tx.authToken.deleteMany({where:{userId:u.id,kind:'RESET'}});
   await tx.authToken.create({data:{id:hash(raw),userId:u.id,email:u.email,kind:'RESET',expiresAt:expiry(0.5)}});
   await mail(tx,u.email,'Reset your HRIS password','reset',raw);
  });}return generic;
 }
 @Post('reset-password')
 async reset(@Body() body:unknown){
  const d=z.object({token:z.string().length(64),password}).parse(body);
  const passwordHash=await argon2.hash(d.password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
  await db.$transaction(async tx=>{
   const t=await tx.authToken.findUnique({where:{id:hash(d.token)}});
   if(!t || t.kind!=='RESET' || !t.userId || t.expiresAt<new Date()) throw new BadRequestException('Reset link is invalid or expired.');
   await tx.authToken.delete({where:{id:t.id}});
   await tx.user.update({where:{id:t.userId},data:{passwordHash}});
   await tx.session.deleteMany({where:{userId:t.userId}});
  });return {message:'Password changed. All sessions were revoked.'};
 }
 @Post('accept-invite')
 async accept(@Body() body:unknown){
  const d=z.object({token:z.string().length(64),name,password}).parse(body);
  const existingToken=await db.authToken.findUnique({where:{id:hash(d.token)}});
  if(!existingToken || existingToken.kind!=='INVITE' || !existingToken.tenantId || existingToken.expiresAt<new Date()) throw new BadRequestException('Invitation is invalid or expired.');
  const passwordHash=await argon2.hash(d.password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
  await db.$transaction(async tx=>{
   const t=await tx.authToken.delete({where:{id:hash(d.token)}});
   let u=await tx.user.findUnique({where:{email:t.email}});
   // Existing users prove possession of their current password; invitations never reset it.
   if(u){if(!await argon2.verify(u.passwordHash,d.password)) throw new UnauthorizedException('Use the existing account password to accept this invitation.');}
   else u=await tx.user.create({data:{email:t.email,name:d.name,passwordHash,verified:true}});
   if(!u.verified) u=await tx.user.update({where:{id:u.id},data:{verified:true}});
   await tx.membership.create({data:{tenantId:t.tenantId!,userId:u.id,role:t.role!,customRoleId:t.customRoleId}});
   await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t.tenantId!}, true)`;
   if(t.employeeId) await tx.employee.update({where:{id:t.employeeId},data:{userId:u.id}});
   await tx.auditEvent.create({data:{tenantId:t.tenantId!,actorId:u.id,action:'INVITATION_ACCEPTED',entityId:u.id,detail:{role:t.role}}});
  });return {message:'Invitation accepted. Sign in with your account.'};
 }
}
@Module({controllers:[AuthController]}) export class AuthModule {}
