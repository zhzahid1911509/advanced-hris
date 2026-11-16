import {BadRequestException,Body,Controller,Module,Put,Req,UseGuards} from '@nestjs/common';
import sharp from 'sharp';
import {z} from 'zod';
import {audit,db,tenantTx} from './db';
import {SessionGuard,TenantGuard,requireRole,type AuthRequest} from './security';

const maxBytes=2*1024*1024;
async function thumbnail(body:unknown){
 const {content}=z.object({content:z.string().min(1).max(4*Math.ceil(maxBytes/3)).nullable()}).strict().parse(body);
 if(content===null)return null;
 const bytes=Buffer.from(content,'base64');
 if(bytes.length>maxBytes||bytes.toString('base64')!==content)throw new BadRequestException('Choose an image of 2 MiB or less.');
 try{
  const image=sharp(bytes,{limitInputPixels:25000000,failOn:'warning'});
  const meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format??''))throw new Error('Unsupported image');
  const result=await image.rotate().resize(192,192,{fit:'cover'}).webp({quality:80}).toBuffer();
  return 'data:image/webp;base64,'+result.toString('base64');
 }catch{throw new BadRequestException('Choose a valid JPEG, PNG or WebP image up to 25 megapixels.');}
}
@Controller('photos')
class PhotoController{
 @Put('account') @UseGuards(SessionGuard)
 async account(@Req() req:AuthRequest,@Body() body:unknown){
  const photo=await thumbnail(body);
  return db.user.update({where:{id:req.userId},data:{photo},select:{photo:true}});
 }
 @Put('organization') @UseGuards(TenantGuard)
 async organization(@Req() req:AuthRequest,@Body() body:unknown){
  requireRole(req.context,'ADMIN');
  const photo=await thumbnail(body);
  return tenantTx(req.context,async tx=>{
   const saved=await tx.tenant.update({where:{id:req.context.tenantId},data:{photo},select:{photo:true}});
   await audit(tx,req.context,photo?'ORGANIZATION_PHOTO_UPDATED':'ORGANIZATION_PHOTO_REMOVED',req.context.tenantId);
   return saved;
  });
 }
}
@Module({controllers:[PhotoController]})export class PhotoModule{}
