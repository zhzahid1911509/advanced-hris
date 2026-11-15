# Direct-report teams · v0.4.0

## Assign a team

1. Sign in as a workspace administrator with a verified MFA session. Create or locate the employee records for the manager and report.
2. Open the report's profile in People. In **Reports to (employee number)** enter the manager's employee number exactly as it appears in the directory. Select **Save reporting line**. Clear the field and save to remove an assignment.
3. In **Access control**, assign the manager's linked member the TEAM_MANAGER role. For a new member, invite them with that role from their employee profile.
4. Sign in as the manager. People and the dashboard include their own employee profile and immediate reports across branches and departments. A report's own reports are outside this scope. A manager without a linked employee profile sees no employees.
5. Under Access control, administrators can separately enable phone visibility for TEAM_MANAGER. Home addresses, emergency contacts and employee timelines are hidden from team managers on directory profiles. Existing employee self-service continues through profile change requests.

## Architecture and API

An employee can report to one employee in the same tenant. Reporting lines model the organization independently of account roles. Assigning a report does not change the manager's membership role. Memberships still have a single role. Existing records start with no assigned manager.

The migration adds a nullable managerId, a composite tenant/employee foreign key, an index for direct-report queries, and support for TEAM_MANAGER in membership and field policies. Directory scope is derived inside the tenant transaction. Search predicates are combined with the scope before pagination and counts. Dashboard queries and direct profile reads use the same scope.

PATCH /api/v1/employees/:id/reporting-line takes the report's current version and a managerEmployeeNo string (or null to clear). A successful call returns the resulting version. A same-value update with the current version is a no-op. Unknown employees return 404, cycles return 400, stale edits return 409. The API requires an administrator with a verified session. It serializes reporting edits per workspace and checks the proposed manager's ancestor chain before changing the record. The employee update and audit event are committed together. Existing directory phone policy endpoints now accept TEAM_MANAGER.

Key files include apps/api/src/directory-access.ts for visibility, apps/api/src/people.ts for updates, apps/web/app/page.tsx for the profile and access controls, and tests/integration.ts for two-process PostgreSQL checks.

## Upgrade, run and build

Back up the current database and root .env. Stop the application and overlay the cumulative source on the existing project folder. Keep your working Neon owner/runtime URLs, MFA key, Redis and SMTP settings. Use Node 22 and start the configured backing services. For fully local development use docker compose up -d and wait for PostgreSQL to become healthy. For an existing hosted setup use its configured services.

Run from the directory containing package.json:

```powershell
npm ci
npm run setup
npm run db:generate
npm run db:migrate
npm run db:check
npm run dev
```

From v0.3.0 the new migration is 202611150002_direct_reports. The web app runs at http://localhost:3000. For a fresh setup see docs/RUN-AND-BUILD.md.

To build, stop dev and run:

```powershell
npm run build
npm run typecheck
npm test
```

With the database migrated and services running, start each compiled workspace in its own terminal:

```powershell
npm run start -w @hris/api
npm run start -w @hris/worker
npm run start -w @hris/web
```

Integration tests write fixtures and change rate limits. Run npm run test:integration only against a dedicated test database. Custom roles and temporary delegation remain separate authorization roadmap items.
