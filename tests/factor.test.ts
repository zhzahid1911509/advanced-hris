import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32, totp } from '../apps/api/src/factor';

test('manual enrollment key uses unpadded base32',()=>{
  assert.equal(base32(Buffer.from('foobar')),'MZXW6YTBOI');
});
test('six-digit SHA-1 TOTP matches truncated RFC 6238 test vector at 59 seconds',()=>{
  assert.equal(totp(Buffer.from('12345678901234567890'),1),'287082');
});
