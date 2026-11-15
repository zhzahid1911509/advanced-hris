BEGIN;
CREATE TABLE custom_roles (
 id uuid PRIMARY KEY,
 "tenantId" uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL,
 scope text NOT NULL CHECK(scope IN ('SELF','TEAM','BRANCH','DEPARTMENT','TENANT')),
 "showPhone" boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 UNIQUE ("tenantId",id)
);
CREATE UNIQUE INDEX custom_role_names ON custom_roles ("tenantId",lower(name));
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON custom_roles USING
 ("tenantId"=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE memberships DROP CONSTRAINT membership_role_check;
ALTER TABLE memberships ADD COLUMN "customRoleId" uuid,
 ADD FOREIGN KEY ("tenantId","customRoleId") REFERENCES custom_roles("tenantId",id),
 ADD CONSTRAINT membership_role_check CHECK (
 (role IN ('ADMIN','HR','EMPLOYEE','AUDITOR','TEAM_MANAGER','BRANCH_MANAGER','DEPARTMENT_MANAGER') AND "customRoleId" IS NULL)
 OR (role='CUSTOM' AND "customRoleId" IS NOT NULL));
ALTER TABLE auth_tokens ADD COLUMN "customRoleId" uuid,
 ADD FOREIGN KEY ("tenantId","customRoleId") REFERENCES custom_roles("tenantId",id);
COMMIT;
