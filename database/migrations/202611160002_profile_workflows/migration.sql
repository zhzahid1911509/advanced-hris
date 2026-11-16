BEGIN;
CREATE TABLE profile_workflows (
 "tenantId" uuid REFERENCES tenants(id), version integer NOT NULL CHECK(version>=2),
 mode text NOT NULL CHECK(mode IN ('EITHER','HR_THEN_ADMIN','BOTH')),
 "publishedAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("tenantId",version)
);
ALTER TABLE profile_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_workflows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON profile_workflows USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE profile_requests ADD COLUMN "workflowVersion" integer NOT NULL DEFAULT 1,
 ADD COLUMN "reviewMode" text NOT NULL DEFAULT 'EITHER',
 ADD COLUMN eligibility jsonb,
 ADD COLUMN reviews jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN revision integer NOT NULL DEFAULT 0,
 ADD COLUMN "previousId" uuid UNIQUE REFERENCES profile_requests(id);
COMMIT;
