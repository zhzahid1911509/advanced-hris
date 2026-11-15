import {BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,Module,NotFoundException,Param,Post,Req,UseGuards} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {audit,tenantTx,type Context,type Tx} from './db';
import {TenantGuard,type AuthRequest} from './security';
import {scanPdf,storeClean,downloadLink} from './document-storage';

const metadata={id:true,name:true,size:true,status:true,version:true,createdAt:true,expiresOn:true} as const;
const limit=2*1024*1024;
const input=z.object({
 id:z.string().uuid(),name:z.string().trim().min(5).max(160).regex(/^[^/\\\x00-\x1f\x7f]+\.pdf$/i),
 content:z.string().min(1).max(4*Math.ceil(limit/3)),expiresOn:z.string().date().nullable()
}).strict();

async function authorize(tx:Tx,c:Context,employeeId:string){
 const staff=['HR','ADMIN'].includes(c.role);
 const employee=await tx.employee.findFirst({where:{id:employeeId,tenantId:c.tenantId,...(staff?{}:{userId:c.userId})},select:{id:true}});
 if(!employee) throw new NotFoundException('Employee documents unavailable.');
}
function keyFor(tenant:string,employee:string,id:string){return tenant+'/'+employee+'/'+id+'.pdf';}

@Controller('employees/:employeeId/documents') @UseGuards(TenantGuard)
export class DocumentController{
 @Get() list(@Req() req:AuthRequest,@Param('employeeId') employeeId:string){
  z.string().uuid().parse(employeeId);
  return tenantTx(req.context,async tx=>{
   await authorize(tx,req.context,employeeId);
   return tx.employeeDocument.findMany({where:{tenantId:req.context.tenantId,employeeId},select:metadata,orderBy:{createdAt:'desc'}});
  });
 }
 @Post() async upload(@Req() req:AuthRequest,@Param('employeeId') employeeId:string,@Body() body:unknown){
  z.string().uuid().parse(employeeId);
  const d=input.parse(body);
  const bytes=Buffer.from(d.content,'base64');
  if(bytes.length>limit || bytes.toString('base64')!==d.content || !/^%PDF-\d\.\d/.test(bytes.subarray(0,8).toString('ascii')) || !/%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1'))) throw new BadRequestException('Choose a PDF up to 2 MiB.');
  const digest=createHash('sha256').update(bytes).digest('hex');
  const c=req.context;
  await tenantTx(c,async tx=>{
   await authorize(tx,c,employeeId);
   const lock=[c.tenantId,employeeId,d.name].join('/');
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 7041))`;
   const prior=await tx.employeeDocument.findUnique({where:{id:d.id},select:{digest:true,employeeId:true,uploadedBy:true,name:true,expiresOn:true}});
   if(prior){
    if(prior.digest!==digest || prior.employeeId!==employeeId || prior.uploadedBy!==c.userId || prior.name!==d.name || (prior.expiresOn?.toISOString().slice(0,10)??null)!==d.expiresOn)throw new ConflictException('Upload ID is already in use.');
    return;
   }
   const latest=await tx.employeeDocument.aggregate({where:{tenantId:c.tenantId,employeeId,name:d.name},_max:{version:true}});
   await tx.employeeDocument.create({data:{id:d.id,tenantId:c.tenantId,employeeId,uploadedBy:c.userId,name:d.name,size:bytes.length,digest,payload:new Uint8Array(bytes),expiresOn:d.expiresOn?new Date(d.expiresOn):null,version:(latest._max.version??0)+1},select:{id:true}});
   await audit(tx,c,'DOCUMENT_UPLOADED',d.id,{employeeId});
  });
  return this.process(c,employeeId,d.id);
 }
 @Post(':id/retry') retry(@Req() req:AuthRequest,@Param('employeeId') employeeId:string,@Param('id') id:string){
  return this.process(req.context,z.string().uuid().parse(employeeId),z.string().uuid().parse(id));
 }
 private async process(c:Context,employeeId:string,id:string){
  const where={tenantId:c.tenantId,employeeId,id};
  const row=await tenantTx(c,async tx=>{
   await authorize(tx,c,employeeId);
   const doc=await tx.employeeDocument.findFirst({where,select:{...metadata,payload:true}});
   if(!doc)throw new NotFoundException();
   return doc;
  });
  const {payload,...summary}=row;
  if(!payload||summary.status!=='QUARANTINED')return summary;
  let verdict:'READY'|'REJECTED';
  let stage:'scan'|'storage'='scan';
  try{
   const bytes=Buffer.from(payload);
   verdict=await scanPdf(bytes);
   if(verdict==='READY'){
    stage='storage';
    await storeClean(keyFor(c.tenantId,employeeId,id),bytes);
   }
  }catch(error){
   const failure=error as {code?:unknown;name?:unknown;$metadata?:{httpStatusCode?:number}}|null;
   const rawCode=failure?.code??failure?.name;
   const code=typeof rawCode==='string' && /^[A-Za-z0-9_]{1,48}$/.test(rawCode)?rawCode:'UnknownError';
   const httpStatus=failure?.$metadata?.httpStatusCode;
   const diagnostic={stage,code,httpStatus};
   console.warn(JSON.stringify({event:'document_release_blocked',...diagnostic}));
   return {...summary,diagnostic};
  }
  return tenantTx(c,async tx=>{
   await authorize(tx,c,employeeId);
   const changed=await tx.employeeDocument.updateMany({where:{...where,status:'QUARANTINED'},data:{status:verdict,payload:null}});
   if(changed.count)await audit(tx,c,'DOCUMENT_'+verdict,id,{employeeId});
   return tx.employeeDocument.findFirstOrThrow({where,select:metadata});
  });
 }
 @Post(':id/download') download(@Req() req:AuthRequest,@Param('employeeId') employeeId:string,@Param('id') id:string){
  z.string().uuid().parse(employeeId);z.string().uuid().parse(id);
  const c=req.context;
  return tenantTx(c,async tx=>{
   await authorize(tx,c,employeeId);
   const doc=await tx.employeeDocument.findFirst({where:{id,employeeId,tenantId:c.tenantId},select:{name:true,status:true}});
   if(!doc)throw new NotFoundException();
   if(doc.status!=='READY')throw new ForbiddenException('This file has not been released.');
   const url=await downloadLink(keyFor(c.tenantId,employeeId,id),doc.name);
   await audit(tx,c,'DOCUMENT_DOWNLOAD_ISSUED',id,{employeeId});
   return {url};
  });
 }
}
@Module({controllers:[DocumentController]}) export class DocumentModule{}
