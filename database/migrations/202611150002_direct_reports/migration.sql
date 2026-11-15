BEGIN;
ALTER TABLE memberships DROP CONSTRAINT membership_role_check;
ALTER TABLE memberships ADD CONSTRAINT membership_role_check CHECK
 (role IN ('ADMIN','HR','AUDITOR','EMPLOYEE','BRANCH_MANAGER','DEPARTMENT_MANAGER','TEAM_MANAGER'));
ALTER TABLE directory_policies DROP CONSTRAINT directory_policies_role_check;
ALTER TABLE directory_policies ADD CONSTRAINT directory_policies_role_check CHECK
 (role IN ('BRANCH_MANAGER','DEPARTMENT_MANAGER','TEAM_MANAGER'));
ALTER TABLE employees ADD COLUMN "managerId" uuid,
 ADD CONSTRAINT employees_manager_fk FOREIGN KEY ("tenantId","managerId") REFERENCES employees("tenantId",id),
 ADD CONSTRAINT employees_manager_not_self CHECK ("managerId" <> id);
CREATE INDEX employees_manager_scope ON employees("tenantId","managerId");
COMMIT;
