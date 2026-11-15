# Custom directory roles · v0.5.0

## Use the feature

Sign in as a workspace administrator with a verified MFA session. In **Access control → Custom directory roles**, enter a name, choose which employee records members may see, and choose whether those profiles show phone numbers. Save the role, then assign it using an existing member's role selector or the **Invite to workspace** action on an employee profile. Example: create “Branch coordinator”, choose “Own branch”, and leave phone access off.

| Scope | Records visible |
|---|---|
| Own record | Employee linked to the signed-in member |
| Self and direct reports | Linked employee and immediate reports |
| Own branch / department | Employees sharing the member's assigned unit. A missing unit falls back to the member's own record |
| Entire workspace | All employees in the active tenant, including when the member has no linked profile |

Scope affects directory search, result counts, recent employees, dashboard employee counts and direct profile reads. The phone switch affects profile detail. Home addresses, emergency contacts and timelines are hidden on these profiles. Members keep existing self-service actions for their own linked record. Custom directory roles confer no HR editing, approval, audit browsing or access administration. Each membership has one role.

Select an existing definition in the role editor to rename it or change its scope or phone permission. Changes apply on subsequent requests, including to members with active sessions. Removing a role requires reassigning all members using it, including suspended members. Outstanding invitations also hold the role until accepted or expired. An expired invitation can be cleaned up during removal.

## Architecture

The custom_roles table stores tenant, UUID, case-insensitively unique role name within the tenant, scope, phone permission and revision. Composite foreign keys on memberships and invitations prevent cross-tenant references. PostgreSQL enforces tenant row-level security on the role definitions. Existing built-in memberships and invitations have a null customRoleId and continue through their existing paths.

The tenant transaction resolves the assigned definition from the database for each custom member. The directory query uses this scope and the profile endpoint applies the field permission. Assignments and invitations resolve a selected UUID within the administrator's tenant. A verified administrator's changes are audited in the same transaction. Revision checks reject conflicting edits and deletes. Foreign keys also protect against concurrent assignment and deletion.

| API under /api/v1 | Purpose |
|---|---|
| GET custom-roles | List definitions for the administrator's workspace |
| POST custom-roles | Create with name, scope and showPhone |
| PATCH custom-roles/:id | Update with the same fields and current version |
| POST custom-roles/:id/remove | Remove an unused definition with current version |
| PATCH members/:id or POST employees/:id/invite | Supply the custom role UUID in the existing role field |

Main files: apps/api/src/custom-roles.ts, directory-access.ts, db.ts, people.ts and auth.ts; apps/web/app/custom-roles.tsx and page.tsx; database/migrations/202611150003_custom_roles/migration.sql; tests/integration.ts.

## Run and build on Windows

Stop dev with Ctrl+C. Back up the database and root .env. Overlay the contents of the extracted advanced-hris folder on your current project. Preserve your configured Neon migration owner and runtime URLs, Redis, SMTP and MFA encryption key. Use Node 22 and start your configured backing services. For a fresh all-local installation use Docker Desktop and run docker compose up -d after setup. Wait for PostgreSQL to become healthy.

From the directory containing package.json:

```powershell
npm ci
npm run setup
npm run db:generate
npm run db:migrate
npm run db:check
npm run dev
```

From v0.4.0 expect 202611150003_custom_roles. Open http://localhost:3000. For fresh-install prerequisites see RUN-AND-BUILD.md.

To build, stop dev and run:

```powershell
npm run build
npm run typecheck
npm test
```

For a compiled run, start each command below in its own terminal with infrastructure running:

```powershell
npm run start -w @hris/api
npm run start -w @hris/worker
npm run start -w @hris/web
```

Run npm run test:integration only against a dedicated migrated test database. The suite writes fixture records and changes rate limits. The next planned authorization increment is temporary delegation.
