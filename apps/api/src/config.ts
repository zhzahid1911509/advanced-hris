import { config } from 'dotenv';
import { resolve } from 'node:path';
config({path:resolve(__dirname,'../../../.env')});
export const origin=process.env.APP_ORIGIN || 'http://localhost:3000';
export const secureCookie=process.env.COOKIE_SECURE==='true';
if(process.env.NODE_ENV==='production' && (!secureCookie || !origin.startsWith('https://'))) {
  throw new Error('Production requires COOKIE_SECURE=true and an HTTPS APP_ORIGIN.');
}
