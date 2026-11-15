# Temporary directory delegation · v0.6.0

## Walkthrough

1. Sign in as an active workspace member, enroll an authenticator under Account security, and use an MFA-verified session.
2. Open Delegations. Enter the employee number of a record you can already see, the sign-in email of another active member of the same workspace, and a future expiry in your local time.
3. In a second browser, sign in as that member. Select the same workspace and open Delegations → View shared profile. The view contains employee number, name, work email, title and employment status.
4. Revoke the grant from the sender's Delegations screen. Reopen it as the recipient to verify removal. Expiry is enforced by the API even if a browser still shows an earlier list. A read already returned to a browser cannot be recalled.

Delegations apply to one employee and one recipient at a time. They are available to members with direct access to the employee. They confer no editing, approvals, private fields, re-delegation authority or changes to the recipient's directory search and dashboard. If the grantor loses the required scope or becomes suspended, reads fail. Restoring that authority can restore access while the grant remains active. Revoke the grant to end it permanently.

## Architecture

The directory_delegations table stores the workspace, grantor, recipient, employee, expiry and optional revocation time. Composite foreign keys bind all three references to the workspace. Forced PostgreSQL row-level security uses the same tenant context as the employee directory. Existing memberships and sessions require no backfill.

The API uses the recipient's authenticated tenant transaction and looks up the addressed grant. It checks expiry and revocation on each read, resolves the grantor's current active membership and any custom directory role, and applies the existing employeeScope predicate to the target record. A successful read selects five allowlisted fields and records the actor, grantor, grant identifier and employee identifier in the audit trail. Creation and revocation also record audit events. Expiry requires no background job. Revocation is idempotent. Repeating the same active grant with the same expiry returns the existing ID. Revoke before replacing an active grant with a different expiry.

| Endpoint under /api/v1 | Behavior |
|---|---|
| POST delegations | Create with employeeNo, recipientEmail and expiresAt (UTC ISO timestamp). Requires verified MFA. |
| GET delegations | List the caller's sent and received grants within this workspace. |
| GET delegations/:id/profile | Read as the designated recipient while the grant and the grantor's scope allow access. |
| POST delegations/:id/revoke | Revoke as the grantor. Revocation remains available without step-up MFA. |

Implementation: apps/api/src/delegations.ts, apps/api/src/directory-access.ts, apps/web/app/delegations.tsx, database/schema.prisma, and database/migrations/202611150004_directory_delegations/migration.sql. Integration coverage is in tests/integration.ts.

## Upgrade, run and build

Stop the app. Back up the database and root .env. Extract the cumulative project over the existing project, preserving the working .env, MFA key, database volume, Neon owner/runtime URLs, SMTP and Redis configuration. Use Node 22. Start the configured supporting services. For fresh local setup run docker compose up -d after npm run setup and wait for PostgreSQL to be healthy. Keep your existing hosted services when upgrading a hosted setup.

In the project root run:

```powershell
npm ci
npm run setup
npm run db:generate
npm run db:migrate
npm run db:check
npm run dev
```

From v0.5.0 expect 202611150004_directory_delegations. Open http://localhost:3000. For clean-install prerequisites see RUN-AND-BUILD.md.

To build, stop dev and run:

```powershell
npm run build
npm run typecheck
npm test
```

With the schema migrated and supporting services running, start the compiled applications in three separate terminals:

```powershell
npm run start -w @hris/api
npm run start -w @hris/worker
npm run start -w @hris/web
```

The PostgreSQL integration suite writes fixtures and changes rate-limit counters. Use a dedicated test database before running npm run test:integration.
