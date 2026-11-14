import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateOnly, profileInput, employeeInput } from '../apps/api/src/validation';
import { requireRole, hash, token } from '../apps/api/src/security';
test('calendar validation rejects dates that JavaScript silently normalizes',()=>{
 assert.equal(dateOnly.safeParse('2025-02-29').success,false);assert.equal(dateOnly.safeParse('2024-02-29').success,true);assert.equal(dateOnly.safeParse('2026-04-31').success,false);
});
test('employee self-service schema rejects privilege-bearing or employment fields',()=>{
 assert.equal(profileInput.safeParse({phone:'',address:'',emergencyContact:'',role:'ADMIN'}).success,false);
 assert.equal(profileInput.safeParse({phone:'',address:'',emergencyContact:'',status:'ACTIVE'}).success,false);
});
test('roles fail closed for unauthorized administrative operations',()=>{
 assert.throws(()=>requireRole({userId:'u',tenantId:'t',role:'EMPLOYEE'},'ADMIN','HR'));
 assert.doesNotThrow(()=>requireRole({userId:'u',tenantId:'t',role:'HR'},'ADMIN','HR'));
});
test('session tokens have independent entropy and only digests identify database sessions',()=>{
 const a=token(),b=token();assert.equal(a.length,64);assert.notEqual(a,b);assert.notEqual(hash(a),a);assert.equal(hash(a),hash(a));
});
