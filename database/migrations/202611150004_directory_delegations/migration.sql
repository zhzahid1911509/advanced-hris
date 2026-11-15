BEGIN;
CREATE TABLE directory_delegations (
 id uuid PRIMARY KEY, "tenantId" uuid NOT NULL, "grantorId" uuid NOT NULL, "recipientId" uuid NOT NULL,
 "employeeId" uuid NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "expiresAt" timestamptz NOT NULL,
 "revokedAt" timestamptz, CHECK ("grantorId" <> "recipientId"),
 FOREIGN KEY ("tenantId","grantorId") REFERENCES memberships ("tenantId","userId"),
 FOREIGN KEY ("tenantId","recipientId") REFERENCES memberships ("tenantId","userId"),
 FOREIGN KEY ("tenantId","employeeId") REFERENCES employees ("tenantId",id)
);
CREATE INDEX directory_delegations_received ON directory_delegations ("tenantId","recipientId","expiresAt");
CREATE INDEX directory_delegations_sent ON directory_delegations ("tenantId","grantorId","createdAt");
ALTER TABLE directory_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_delegations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON directory_delegations USING
 ("tenantId"=nullif(current_setting('app.tenant_id',true),'')::uuid);
COMMIT;
