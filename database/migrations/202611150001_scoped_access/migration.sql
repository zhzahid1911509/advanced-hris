ALTER TABLE memberships DROP CONSTRAINT membership_role_check;
ALTER TABLE memberships ADD CONSTRAINT membership_role_check CHECK
  (role IN ('ADMIN','HR','EMPLOYEE','AUDITOR','BRANCH_MANAGER','DEPARTMENT_MANAGER'));
CREATE TABLE directory_policies (
  "tenantId" uuid NOT NULL REFERENCES tenants(id),
  role text NOT NULL CHECK (role IN ('BRANCH_MANAGER','DEPARTMENT_MANAGER')),
  "showPhone" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("tenantId",role)
);
ALTER TABLE directory_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_policy ON directory_policies USING
  ("tenantId" = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
