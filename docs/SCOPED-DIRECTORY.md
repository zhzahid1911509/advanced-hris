# Scoped employee access · v0.3.0

## Implementation and architecture

This increment covers the live employee directory. It adds two assignable membership roles and a per-workspace phone visibility setting for each. Existing invitations and existing administrator, HR, employee, and auditor memberships remain valid. Managers have no approval or employee-edit authority.

| Role | Directory scope | Private contact fields on profile | Profile change review |
|---|---|---|---|
| ADMIN | Workspace | All | Independent reviewer |
| HR | Workspace | All | Independent reviewer |
| AUDITOR | Workspace | Hidden | Read with submitted changes masked |
| EMPLOYEE | Linked employee | Own | Own requests |
| BRANCH_MANAGER | Linked employee's current branch | Phone only when enabled | Own requests |
| DEPARTMENT_MANAGER | Linked employee's current department | Phone only when enabled | Own requests |

For a manager with no assigned unit, only their linked employee profile is visible. A manager without a linked profile sees an empty directory. Unit names remain workspace-wide. Work email is part of the directory. Managers cannot see profile timelines, home addresses or emergency contacts on directory detail. They can still submit and view their own contact change requests.

The tenant guard resolves an active membership. Inside the tenant transaction, directory-access.ts derives the employee predicate from the linked record. The people controller applies that predicate to counts, recent hires, directory search, and individual profile lookups. The client supplies no scope identifier. A guessed out-of-scope employee ID returns 404. Existing tenant RLS applies underneath the application-level unit filter.

The migration extends the membership role constraint and creates directory_policies with a tenant/role primary key and forced row-level security. A missing setting means phone access is disabled. GET /api/v1/directory-policies returns both manager settings to an administrator. PATCH /api/v1/directory-policies/:role accepts a boolean showPhone, requires administrator access and a verified session, and writes an audit event in the same transaction. Settings apply on subsequent API requests.

## Try it

1. As administrator, enroll an authenticator in Account security and create a branch or department under Organization.
2. Assign a manager's employee record and a second employee to that unit. Assign a third employee to a different unit.
3. Open the manager's profile and invite them with the matching manager role. For an existing member, use Access control to change their role.
4. Sign in as that member in a separate browser. Check People and the dashboard. The manager should see the first two employees.
5. As administrator, enable phone access for that manager role in Access control. Reopen a visible employee profile as the manager to see the phone field. Disable it and reopen to verify removal.

## Upgrade and build on Windows

Stop npm run dev. Back up your database and root .env. Extract the cumulative source over your existing advanced-hris project, retaining the working .env, MFA key and Docker volumes. Use Node 22 and open PowerShell in the folder containing package.json.

```powershell
npm ci
npm run setup
npm run db:generate
npm run db:migrate
npm run db:check
npm run dev
```

Start any local supporting services before migrating or starting dev. For an all-local install run docker compose up -d and wait for PostgreSQL to be healthy. With Neon, retain the working direct migration-owner URL and restricted hris_app runtime URL pointing to the same database. Start Redis and Mailpit locally only if your configuration uses them. From v0.2.0 the expected new migration is 202611150001_scoped_access. Open http://localhost:3000.

For a compiled run, stop dev and run npm run build, npm run typecheck and npm test. Start each of the following in its own terminal from the project root:

```powershell
npm run start -w @hris/api
npm run start -w @hris/worker
npm run start -w @hris/web
```

Use a dedicated migrated test database for npm run test:integration. The integration suite writes fixtures and clears rate-limit counters. See RUN-AND-BUILD.md for clean setup and service configuration.

## Remaining authorization work

This is the directory portion of the authorization milestone. Custom role creation, multiple roles per membership, explicit direct-report teams, temporary delegation and module-specific permissions are still on the roadmap.
