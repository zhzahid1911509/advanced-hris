import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { hash } from './security';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes: Buffer): string {
  let value = 0, bits = 0, result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function key(): Buffer {
  const text = process.env.MFA_ENCRYPTION_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(text)) {
    throw new ServiceUnavailableException('Configure the MFA encryption key. For local development run npm run setup and restart the API.');
  }
  return Buffer.from(text,'hex');
}

export function seal(secret: Buffer, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(secret),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');
}

export function unseal(stored: string, userId: string): Buffer {
  const data = Buffer.from(stored,'base64');
  const cipher = createDecipheriv('aes-256-gcm',key(),data.subarray(0,12));
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]);
}

export function totp(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1',secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6,'0');
}

export function matchStep(secret: Buffer, code: string, last: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(Date.now()/30000);
  for (const step of [now,now-1,now+1]) {
    if (step > (last ?? -1) && timingSafeEqual(Buffer.from(totp(secret,step)),Buffer.from(code))) return step;
  }
  return null;
}

export function recoveryDigest(code: string): string {
  return hash(code.toLowerCase().replace(/-/g,'').trim());
}

export function newRecoverySet() {
  const codes = Array.from({length:8},()=>randomBytes(12).toString('hex').match(/.{4}/g)!.join('-'));
  return { codes, hashes:codes.map(recoveryDigest) };
}
