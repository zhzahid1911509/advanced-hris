import 'reflect-metadata';
import {json} from 'express';
import {DocumentModule} from './documents';
import './config';
import { NestFactory } from '@nestjs/core';
import { Module, Controller, Get, Catch, ArgumentsHost, ExceptionFilter, HttpException } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { origin } from './config';
import { hash } from './security';
import { AccountModule } from './account-security';
import { AuthModule } from './auth';
import { PeopleModule } from './people';
@Catch()
class Errors implements ExceptionFilter {
 catch(e:unknown,host:ArgumentsHost){
  const res=host.switchToHttp().getResponse<Response>();
  const requestId=res.getHeader('x-request-id');let status=500,message='Something went wrong. Please try again.';
  if(e instanceof HttpException){status=e.getStatus();message=e.message;}
  else if(e instanceof ZodError){status=400;message=e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ');}
  else if(e instanceof Prisma.PrismaClientKnownRequestError){
   if(e.code==='P2002'){status=409;message='A record with these unique values already exists.';}
   else if(e.code==='P2025'){status=404;message='Record not found or no longer available.';}
   else if(e.code==='P2003'){status=400;message='Invalid record relationship.';}
   else if(e.code==='P2034'){status=409;message='Concurrent update. Refresh and retry.';}
  }
  if(status===500)console.error(JSON.stringify({level:'error',requestId,type:e instanceof Error?e.name:'unknown'}));
  res.status(status).json({statusCode:status,message,requestId});
 }
}
@Controller('health') class HealthController {
 @Get() async health(){await db.$queryRaw`SELECT 1`;return {status:'ok',version:'0.7.0'};}
}
@Module({imports:[AuthModule,PeopleModule,AccountModule,DocumentModule],controllers:[HealthController]}) class AppModule {}
async function main(){
 const app=await NestFactory.create(AppModule,{logger:['error','warn','log']});
 app.setGlobalPrefix('api/v1');
 app.use(helmet(),cookieParser());
 app.use(async(req:Request,res:Response,next:NextFunction)=>{
  const requestId=randomUUID();res.setHeader('x-request-id',requestId);res.setHeader('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin!==origin){res.status(403).json({message:'Request origin is not allowed.',requestId});return;}
  if(!['GET','HEAD','OPTIONS'].includes(req.method) && !req.is('application/json')){res.status(415).json({message:'Use application/json.',requestId});return;}
  if(req.path.endsWith('/health'))return next();
  try{
   // Shared DB limiter works across API replicas. Fixed windows have bounded edge bursts.
   const login=req.path.startsWith('/api/v1/auth/') && req.method==='POST';
   const windowMs=login?15*60000:60000;const slot=Math.floor(Date.now()/windowMs);
   const key=hash(`${req.ip}:${login?'auth':'api'}:${slot}`);
   const counter=await db.rateLimit.upsert({where:{id:key},create:{id:key,count:1,expiresAt:new Date((slot+1)*windowMs)},update:{count:{increment:1}}});
   if(counter.count>(login?30:600)){res.setHeader('Retry-After',Math.ceil(((slot+1)*windowMs-Date.now())/1000));res.status(429).json({message:'Too many requests. Please wait and try again.',requestId});return;}
   next();
  }catch{res.status(503).json({message:'Service temporarily unavailable.',requestId});}
 });
 app.use('/api/v1/employees/:employeeId/documents',json({limit:'3mb'}));
 app.use(json());
 app.useGlobalFilters(new Errors());
 const swagger=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('Advanced HRIS API').setVersion('0.7.0').addCookieAuth('hris_session').addApiKey({type:'apiKey',in:'header',name:'x-tenant-id'},'tenant').build());
 SwaggerModule.setup('api/docs',app,swagger);
 const role=await db.$queryRaw<Array<{rolsuper:boolean;rolbypassrls:boolean}>>`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`;
 if(role[0]?.rolsuper || role[0]?.rolbypassrls)throw new Error('Refusing to run API with privileged database credentials. Use hris_app.');
 await app.listen(Number(process.env.API_PORT || 4000),'0.0.0.0');
 const stop=async()=>{await app.close();await db.$disconnect();process.exit(0);};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Startup failed');process.exit(1);});
