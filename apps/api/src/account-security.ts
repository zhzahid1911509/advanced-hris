import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Module, NotFoundException, Param, Post, Req, UnauthorizedException, UseGuards, HttpException } from '@nestjs/common';
import { User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { db, Tx } from './db';
import { AuthRequest, SessionGuard, hash } from './security';
import { base32, seal, unseal, matchStep, newRecoverySet, recoveryDigest } from './factor';

export async function lockedUser(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.user.findUniqueOrThrow({where:{id}});
}

export async function verifyFactor(tx: Tx, user: User, code: string) {
  if (!user.mfaSecret) throw new ConflictException('Enroll an authenticator first.');
  const step = matchStep(unseal(user.mfaSecret,user.id),code,user.lastTotpStep);
  if (step !== null) {
    await tx.user.update({where:{id:user.id},data:{lastTotpStep:step}});
    return;
  }
  const digest = recoveryDigest(code);
  if (!user.recoveryHashes.includes(digest)) {
    throw new UnauthorizedException('Invalid or already used code. Try the next authenticator code or an unused recovery code.');
  }
  await tx.user.update({where:{id:user.id},data:{recoveryHashes:user.recoveryHashes.filter(item=>item!==digest)}});
}

// Reserve an attempt before checking credentials so concurrent requests share the same budget.
export async function reserveAttempt(email: string) {
  const windowMs = 15 * 60000;
  const slot = Math.floor(Date.now()/windowMs);
  const id = hash('account-login/'+email+'/'+slot);
  const row = await db.rateLimit.upsert({
    where:{id},create:{id,count:1,expiresAt:new Date((slot+1)*windowMs)},update:{count:{increment:1}}
  });
  if (row.count > 10) throw new HttpException('Sign-in attempt limit reached. Try again after the current 15-minute window.',429);
  return id;
}

export async function requireVerifiedSession(req: AuthRequest) {
  const session = await db.session.findUnique({where:{id:req.sessionId},select:{factorAt:true}});
  if (!session?.factorAt) throw new ForbiddenException('Enable your authenticator in Your account before changing organization access.');
}

const passwordInput = z.string().min(1).max(128);
const codeInput = z.string().trim().min(1).max(48);
async function checkPassword(user:User,password:string) {
  if (!await argon2.verify(user.passwordHash,password)) throw new UnauthorizedException('Incorrect current password.');
}

@Controller('account') @UseGuards(SessionGuard)
export class AccountController {
  @Get('security')
  async status(@Req() req:AuthRequest) {
    const user = await db.user.findUniqueOrThrow({where:{id:req.userId}});
    const sessions = await db.session.findMany({
      where:{userId:req.userId,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},
      select:{handle:true,id:true,agent:true,createdAt:true,expiresAt:true,factorAt:true}
    });
    return {
      enabled:Boolean(user.mfaSecret),recoveryRemaining:user.recoveryHashes.length,
      sessions:sessions.map(({id,...s})=>({...s,current:id===req.sessionId}))
    };
  }

  @Post('enroll')
  async begin(@Req() req:AuthRequest,@Body() body:unknown) {
    const input = z.object({password:passwordInput}).strict().parse(body);
    await reserveAttempt('factor-management/'+req.userId);
    return db.$transaction(async tx=>{
      const user = await lockedUser(tx,req.userId);
      await checkPassword(user,input.password);
      if (user.mfaSecret) throw new ConflictException('Authenticator already enabled.');
      const secret = randomBytes(20);
      await tx.user.update({where:{id:user.id},data:{
        pendingSecret:seal(secret,user.id),pendingUntil:new Date(Date.now()+10*60000)
      }});
      return {manualKey:base32(secret),account:user.email,issuer:'Advanced HRIS'};
    });
  }

  @Post('confirm')
  async confirm(@Req() req:AuthRequest,@Body() body:unknown) {
    const {code} = z.object({code:codeInput}).strict().parse(body);
    await reserveAttempt('factor-management/'+req.userId);
    return db.$transaction(async tx=>{
      const user = await lockedUser(tx,req.userId);
      if (!user.pendingSecret || !user.pendingUntil || user.pendingUntil <= new Date() || user.mfaSecret) {
        throw new BadRequestException('Start a new authenticator enrollment.');
      }
      const step = matchStep(unseal(user.pendingSecret,user.id),code,null);
      if (step === null) throw new BadRequestException('Incorrect authenticator code.');
      const recovery = newRecoverySet();
      await tx.user.update({where:{id:user.id},data:{
        mfaSecret:user.pendingSecret,pendingSecret:null,pendingUntil:null,lastTotpStep:step,recoveryHashes:recovery.hashes
      }});
      await tx.session.deleteMany({where:{userId:user.id,id:{not:req.sessionId}}});
      await tx.session.update({where:{id:req.sessionId},data:{factorAt:new Date()}});
      return {recoveryCodes:recovery.codes};
    });
  }

  @Post('disable')
  async disable(@Req() req:AuthRequest,@Body() body:unknown) {
    const {password,code} = z.object({password:passwordInput,code:codeInput}).strict().parse(body);
    await reserveAttempt('factor-management/'+req.userId);
    return db.$transaction(async tx=>{
      const user = await lockedUser(tx,req.userId);
      await checkPassword(user,password);
      await verifyFactor(tx,user,code);
      await tx.user.update({where:{id:user.id},data:{
        mfaSecret:null,pendingSecret:null,pendingUntil:null,lastTotpStep:null,recoveryHashes:[]
      }});
      await tx.session.deleteMany({where:{userId:user.id,id:{not:req.sessionId}}});
      await tx.session.update({where:{id:req.sessionId},data:{factorAt:null}});
      return {message:'Authenticator disabled.'};
    });
  }

  @Post('sessions/:handle/revoke')
  async revoke(@Req() req:AuthRequest,@Param('handle') raw:string) {
    const handle = z.string().uuid().parse(raw);
    const result = await db.session.deleteMany({where:{handle,userId:req.userId,id:{not:req.sessionId}}});
    if (!result.count) throw new NotFoundException('No other active session with this identifier.');
    return {message:'Session revoked.'};
  }
}

@Module({controllers:[AccountController]}) export class AccountModule {}
