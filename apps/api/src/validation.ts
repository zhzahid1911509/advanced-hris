import { z } from 'zod';
export const email=z.string().trim().email().max(254).transform(s=>s.toLowerCase());
export const password=z.string().min(12,'Use at least 12 characters.').max(128);
export const name=z.string().trim().min(2).max(100);
export const uuid=z.string().uuid();
export const dateOnly=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T00:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;},'Enter a valid date.');
export const contactFields={phone:z.string().trim().max(30),address:z.string().trim().max(500),emergencyContact:z.string().trim().max(250)};
export const employeeInput=z.object({employeeNo:z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/),name,email,title:z.string().trim().min(2).max(100),category:z.enum(['PERMANENT','CONTRACT','TEMPORARY','PROBATION','PART_TIME','INTERN','OUTSOURCED']),status:z.enum(['ACTIVE','ON_LEAVE','INACTIVE']),joinedOn:dateOnly,branchId:uuid.nullable(),departmentId:uuid.nullable(),...contactFields}).strict();
export const profileInput=z.object(contactFields).strict();
