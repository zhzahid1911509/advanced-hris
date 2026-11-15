BEGIN;
CREATE TABLE employee_documents (
 id uuid PRIMARY KEY, "tenantId" uuid NOT NULL, "employeeId" uuid NOT NULL, "uploadedBy" uuid NOT NULL,
 name text NOT NULL, version integer NOT NULL, size integer NOT NULL, digest text NOT NULL,
 status text NOT NULL DEFAULT 'QUARANTINED' CHECK(status IN ('QUARANTINED','READY','REJECTED')),
 payload bytea, "expiresOn" date, "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE ("tenantId","employeeId",name,version),
 FOREIGN KEY ("tenantId","employeeId") REFERENCES employees("tenantId",id),
 CHECK ((status='QUARANTINED')=(payload IS NOT NULL))
);
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON employee_documents USING
 ("tenantId"=nullif(current_setting('app.tenant_id',true),'')::uuid);
COMMIT;
