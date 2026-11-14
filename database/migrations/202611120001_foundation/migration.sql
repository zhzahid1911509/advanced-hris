-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "csrf" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "userId" UUID,
    "tenantId" UUID,
    "employeeId" UUID,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_mail" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_mail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_units" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "emergencyContact" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PERMANENT',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedOn" DATE NOT NULL,
    "branchId" UUID,
    "departmentId" UUID,
    "userId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "profile_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_userId_active_idx" ON "memberships"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenantId_userId_key" ON "memberships"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_tokens_email_kind_idx" ON "auth_tokens"("email", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "org_units_tenantId_id_key" ON "org_units"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "org_units_tenantId_kind_name_key" ON "org_units"("tenantId", "kind", "name");

-- CreateIndex
CREATE INDEX "employees_tenantId_status_name_idx" ON "employees"("tenantId", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_id_key" ON "employees"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_employeeNo_key" ON "employees"("tenantId", "employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_email_key" ON "employees"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_userId_key" ON "employees"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "employee_events_tenantId_employeeId_createdAt_idx" ON "employee_events"("tenantId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "profile_requests_tenantId_state_idx" ON "profile_requests"("tenantId", "state");

-- CreateIndex
CREATE INDEX "audit_events_tenantId_createdAt_idx" ON "audit_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_tenantId_deliveredAt_idx" ON "outbox"("tenantId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_sourceId_key" ON "notifications"("sourceId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_userId_createdAt_idx" ON "notifications"("tenantId", "userId", "createdAt");


-- Explicit integrity and tenant isolation beyond ORM declarations.
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "org_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_units" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "org_units" USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid);
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employees" USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid);
ALTER TABLE "employee_events" ADD CONSTRAINT "employee_events_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "employee_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_events" USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid);
ALTER TABLE "profile_requests" ADD CONSTRAINT "profile_requests_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "profile_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profile_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "profile_requests" USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid);
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_events" USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid);
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "outbox" USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications" USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true),'')::uuid);

ALTER TABLE memberships ADD CONSTRAINT membership_tenant_fk FOREIGN KEY ("tenantId") REFERENCES tenants(id);
ALTER TABLE memberships ADD CONSTRAINT membership_user_fk FOREIGN KEY ("userId") REFERENCES users(id);
ALTER TABLE memberships ADD CONSTRAINT membership_role_check CHECK (role IN ('ADMIN','HR','EMPLOYEE','AUDITOR'));
ALTER TABLE sessions ADD CONSTRAINT session_user_fk FOREIGN KEY ("userId") REFERENCES users(id);
ALTER TABLE auth_tokens ADD CONSTRAINT token_user_fk FOREIGN KEY ("userId") REFERENCES users(id);
ALTER TABLE auth_tokens ADD CONSTRAINT token_tenant_fk FOREIGN KEY ("tenantId") REFERENCES tenants(id);
ALTER TABLE org_units ADD CONSTRAINT unit_kind_check CHECK (kind IN ('BRANCH','DEPARTMENT'));
ALTER TABLE employees ADD CONSTRAINT employee_branch_fk FOREIGN KEY ("tenantId","branchId") REFERENCES org_units("tenantId",id);
ALTER TABLE employees ADD CONSTRAINT employee_department_fk FOREIGN KEY ("tenantId","departmentId") REFERENCES org_units("tenantId",id);
ALTER TABLE employees ADD CONSTRAINT employee_user_fk FOREIGN KEY ("tenantId","userId") REFERENCES memberships("tenantId","userId");
ALTER TABLE employees ADD CONSTRAINT employee_status_check CHECK (status IN ('ACTIVE','ON_LEAVE','INACTIVE'));
ALTER TABLE employees ADD CONSTRAINT employee_version_check CHECK (version > 0);
ALTER TABLE employee_events ADD CONSTRAINT event_employee_fk FOREIGN KEY ("tenantId","employeeId") REFERENCES employees("tenantId",id);
ALTER TABLE profile_requests ADD CONSTRAINT request_employee_fk FOREIGN KEY ("tenantId","employeeId") REFERENCES employees("tenantId",id);
ALTER TABLE profile_requests ADD CONSTRAINT request_state_check CHECK (state IN ('PENDING','APPROVED','REJECTED'));
CREATE UNIQUE INDEX one_pending_profile_request ON profile_requests("tenantId","employeeId") WHERE state='PENDING';
ALTER TABLE notifications ADD CONSTRAINT notification_member_fk FOREIGN KEY ("tenantId","userId") REFERENCES memberships("tenantId","userId");
ALTER TABLE auth_tokens ADD CONSTRAINT token_employee_fk FOREIGN KEY ("tenantId","employeeId") REFERENCES employees("tenantId",id);
-- Audit/event UPDATE/DELETE permissions are revoked by the migration runner.
