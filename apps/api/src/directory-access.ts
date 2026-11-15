import type { Prisma } from '@prisma/client';
import type { Context, Tx } from './db';

export const managerRoles = ['BRANCH_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_MANAGER'] as const;
export const assignableRoles = ['HR', 'EMPLOYEE', 'AUDITOR', ...managerRoles] as const;

export function isManager(role:string) {
  return role==='CUSTOM' || managerRoles.some(candidate => candidate === role);
}

export async function employeeScope(tx:Tx, context:Context):Promise<Prisma.EmployeeWhereInput> {
  const {tenantId, userId, role} = context;
  if (['ADMIN', 'HR', 'AUDITOR'].includes(role)) return {tenantId};
  const scope=context.directoryRole?.scope;
  if (scope==='TENANT') return {tenantId};
  if (scope==='SELF' || !isManager(role)) return {tenantId, userId};
  const employee = await tx.employee.findFirst({
    where:{tenantId,userId}, select:{id:true,branchId:true,departmentId:true}
  });
  if (role === 'TEAM_MANAGER' || scope==='TEAM') {
    return employee ? {tenantId, OR:[{id:employee.id},{managerId:employee.id}]} : {tenantId,userId};
  }
  const field = (role === 'BRANCH_MANAGER' || scope==='BRANCH') ? 'branchId' : 'departmentId';
  const unit = employee?.[field];
  if (!unit) return {tenantId,userId};
  return {tenantId,[field]:unit};
}
