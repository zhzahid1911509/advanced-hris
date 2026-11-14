# Run, build, test and troubleshoot

## 1. Prerequisites

- Node.js **22 LTS** (the code was also compiled/tested with Node 24.22.1); npm 10 or newer. `node --version`, `npm --version`.
- Docker Desktop on Windows/macOS, or Docker Engine plus Compose v2 on Linux. On Windows, enable Linux containers and WSL2 as required by Docker Desktop.
- Ports 3000 (web), 4000 (API), 5432 (PostgreSQL), 6379 (Redis), 1025 (SMTP), 8025 (Mailpit UI) available.
- An internet connection for the first npm/Docker dependency downloads.

Extract the ZIP. Open the inner **advanced-hris** folder containing package.json, compose.yaml and README.md. Do not run commands from the ZIP viewer or from its parent folder.

Windows PowerShell example:

```powershell
cd C:\Users\YourName\Desktop\advanced-hris
node --version
npm --version
docker compose version
```

If PowerShell blocks npm.ps1, use `npm.cmd` instead of `npm`; do not weaken system-wide script execution policy. All project scripts otherwise work from PowerShell, Command Prompt, macOS Terminal and Bash.

## 2. Install and configure

```sh
npm ci
npm run setup
```

`npm ci` installs the lockfile versions. `setup` generates `.env` in the root with random local PostgreSQL owner/runtime passwords. It does not overwrite an existing `.env`. Keep the file private. The `.env.example` documents the variables but contains placeholders.

Default host development connections:

| Variable | Purpose |
|---|---|
| POSTGRES_PASSWORD | Local postgres owner password used by Compose |
| APP_DB_PASSWORD | Restricted runtime role password, at least 16 characters |
| DATABASE_URL | Prisma/runtime connection as hris_app, not postgres |
| MIGRATION_DATABASE_URL | Owner connection only for migrations/tests |
| REDIS_URL | Local BullMQ Redis connection |
| APP_ORIGIN | Exact browser origin; default http://localhost:3000 |
| API_INTERNAL_URL | Next's backend target; default http://127.0.0.1:4000 |
| API_PORT | 4000 by default |
| SMTP_HOST / SMTP_PORT | localhost:1025 for Mailpit |
| MAIL_FROM | Sender name/address |
| COOKIE_SECURE | false only for local HTTP; true for production HTTPS |
| REGISTRATION_ENABLED | true for local organization creation; turn off when not needed |

Use http://localhost:3000 consistently. Opening http://127.0.0.1:3000 while APP_ORIGIN says localhost will fail strict Origin checks. If you change the web hostname/port, change APP_ORIGIN and restart the API/worker. Email links use APP_ORIGIN.

The API/worker read the root `.env`. Next defaults to the host API target; for custom development API routing, create `apps/web/.env.local` with `API_INTERNAL_URL=http://127.0.0.1:YOUR_PORT` and restart/rebuild Next. In Docker the variable is supplied as a build argument and service environment.

## 3. Start supporting services

```sh
docker compose up -d
docker compose ps
```

Postgres should become healthy. Redis and Mailpit should be running. This base command starts only supporting services, not the application.

```sh
npm run db:generate
npm run db:migrate
```

The migration command provisions the restricted `hris_app` role, applies migrations using owner credentials, grants runtime privileges and revokes audit/event update/delete privileges. The API refuses superuser/BYPASSRLS credentials. Never solve a runtime connection problem by changing DATABASE_URL to postgres.

## 4. Start development mode

```sh
npm run dev
```

This launches API, web and worker with process labels and watch mode. Keep this terminal open. Open the web at http://localhost:3000. The service health route is http://localhost:4000/api/v1/health.

For separate terminals instead:

```sh
npm run dev -w @hris/api
npm run dev -w @hris/worker
npm run dev -w @hris/web
```

Run each line in a separate terminal. Do not run these in addition to the combined dev command.

## 5. Complete the first real workflow

1. Click **Create a workspace**. Choose organization name, lowercase unique slug, administrator name/email and password of at least 12 characters.
2. Open http://localhost:8025. Open the verification email, follow its link and click **Verify email**. Mailpit accepts any development email address; it does not deliver externally.
3. Sign in at http://localhost:3000.
4. In **Organization**, add a branch and department.
5. In **People**, add an employee. Enter unique employee number/email and employment details.
6. Open the employee profile → **Invite to workspace** → Employee role. Check Mailpit for its invitation.
7. In a private window or another browser, open the invitation. Enter a name and a new password; if the email already belongs to an account, enter its current password. Sign in.
8. As employee, open your profile → **Request contact update**. Submit the change.
9. As administrator, open **Approvals** → Review request → provide a note → approve.
10. Refresh the employee profile and notifications. Check **Audit trail** as administrator. The worker polls every three seconds, so notifications may appear a few seconds later.

No seed account is supplied. Create your own users through these flows. This avoids shipping reusable privileged credentials.

## 6. Build and run compiled applications

Stop dev mode first with Ctrl+C.

```sh
npm run build
npm run typecheck
npm test
```

Build order: Prisma client, API TypeScript, worker TypeScript, Next production build. Output is in apps/api/dist, apps/worker/dist and apps/web/.next.

Run one command in each of three terminals:

```sh
npm run start -w @hris/api
```

```sh
npm run start -w @hris/worker
```

```sh
npm run start -w @hris/web
```

Supporting services must remain running. The local API uses HTTP when NODE_ENV is unset. Setting NODE_ENV=production requires an HTTPS APP_ORIGIN and COOKIE_SECURE=true; the API intentionally fails startup otherwise.

## 7. Optional all-container local build

This is an alternative to host Node processes. It supplies a production-compiled web build with local API cookie settings; it is **not** a hardened production topology.

```sh
npm run setup
docker compose -f compose.yaml -f compose.app.yaml up --build -d
docker compose -f compose.yaml -f compose.app.yaml ps
docker compose -f compose.yaml -f compose.app.yaml logs -f api worker web
```

The migration container must exit successfully before API and worker start. Same URLs as host development. Inspect failed migrations with `docker compose -f compose.yaml -f compose.app.yaml logs migrate`.

The image retains build/migration dependencies for simplicity. Optimize and split the production migration image later. This container build configuration is included but was not executed in the delivery environment because Docker was unavailable.

## 8. Run the integration tests safely

Use a dedicated test database. Integration tests create synthetic organizations/accounts and clear rate-limit counters; do not run them against production or real employee data. They launch two compiled API processes on ports 4101 and 4102 and test both against one database. Do not run the worker during core integration tests because tests inspect queued email tokens before delivery redacts them.

Create a separate database using the owner in the local Postgres container:

```sh
docker compose exec postgres psql -U postgres -c "CREATE DATABASE hris_test;"
```

PowerShell (in a **new terminal**, so normal development values are preserved):

```powershell
$env:MIGRATION_DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/hris_test"
$env:DATABASE_URL="postgresql://hris_app:YOUR_APP_DB_PASSWORD@localhost:5432/hris_test"
$env:APP_DB_PASSWORD="YOUR_APP_DB_PASSWORD"
npm run db:migrate
npm run build -w @hris/api
npm run test:integration
```

macOS/Linux:

```sh
export MIGRATION_DATABASE_URL='postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/hris_test'
export DATABASE_URL='postgresql://hris_app:YOUR_APP_DB_PASSWORD@localhost:5432/hris_test'
export APP_DB_PASSWORD='YOUR_APP_DB_PASSWORD'
npm run db:migrate
npm run build -w @hris/api
npm run test:integration
```

Replace placeholders with values from your private `.env`; do not paste them into chat or commit them. The generated passwords are hexadecimal and do not need URL escaping. Other passwords must be URL-encoded in connection strings. Close the test terminal when done to discard overrides.

Worker integration test: after core tests finish, run a compiled worker pointed at the test database, with Redis and Mailpit available. From a second terminal with the same test DB environment, run:

```sh
node --import tsx tests/worker-integration.ts
```

It checks SMTP acceptance, in-app delivery and duplicate replay protection. Then stop that test worker. The included CI executes unit/core integration/build checks with PostgreSQL 17; worker tests are a separate documented check.

## 9. Stop and restart

Ctrl+C stops host applications.

```sh
docker compose stop
```

This stops supporting services and preserves data. `docker compose up -d` starts them again. `docker compose down` removes containers/network but preserves named volumes. **Do not use `down -v` unless you intentionally want to delete local data.** Never regenerate `.env` for an existing volume without understanding the stored database password; changing an environment variable does not automatically change an initialized postgres owner's password.

For the all-container alternative, use both Compose files for stop/down/log commands.

## 10. Troubleshooting

| Symptom | Check / resolution |
|---|---|
| Cannot connect to Docker | Start Docker Desktop; verify Linux containers and `docker compose version` |
| P1001 / database unavailable | Check `docker compose ps`; wait for postgres healthy; confirm port 5432 and URL |
| Password authentication failed | Match credentials to the original volume; do not delete data to hide a configuration problem |
| Permission denied / RLS error | Run migration script with owner URL, keep runtime URL on hris_app |
| API refuses privileged credentials | Correct DATABASE_URL; never disable the startup check |
| Request origin not allowed | Use the exact APP_ORIGIN host/port; restart API after environment edits |
| Verification/invitation not arriving | Check worker logs, Redis, SMTP settings and Mailpit; queued mail requires the worker |
| Expired verification token | Use Resend verification on the login screen |
| Reset/invite link opens existing workspace | Updated UI handles token actions even when another session exists; restart/rebuild if using stale frontend code |
| 409 on editing | Someone changed the record; refresh it and reapply changes |
| Approval returns stale-record conflict | Reject the pending request with explanation, then have employee resubmit current details |
| 429 Too many requests | Wait for Retry-After. The local proxy shares the conservative limiter; see SECURITY.md before scaling |
| EADDRINUSE | Stop an earlier dev/compiled process; do not run both at once |
| Next cannot reach API | Check port 4000 and API health; use host target in local mode and api:4000 inside Docker |
| Missing generated Prisma client | Run npm run db:generate after npm ci |
| next start says no production build | Run npm run build first |
| SMTP delivery repeatedly fails | Correct provider settings, then retry the named failed job as below |

For a real SMTP server set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD in the root environment; use SMTP_SECURE=true for implicit TLS on the provider's designated port. Mailpit's local port is unencrypted. Use your provider's verified sender/domain. Restart the worker after changes. Do not disable certificate validation.

Retry one failed delivery using the job ID in redacted worker logs:

```sh
node scripts/retry-delivery.mjs email-JOB_UUID
```

Notification jobs use `notification-OUTBOX_UUID`. Supply the exact ID from logs; do not guess. Only failed jobs are retried.

## 11. Before production hosting

Complete the outstanding security items in FEATURE-IMPLEMENTATION.md, particularly MFA and scalable abuse controls. Provision managed/restricted PostgreSQL and Redis, secure object storage when added, an HTTPS reverse proxy, production SMTP, secrets management, backups/restoration tests and monitoring. Expose only the web ingress; do not publish database/Redis/Mailpit ports. Configure a reviewed trusted-proxy strategy rather than blindly trusting forwarded headers. Review applicable local privacy/retention obligations. Keep owner credentials only in the migration process.

No cloud site or GitHub repository has been published. Docker configuration, source and instructions are supplied for your own environment.
