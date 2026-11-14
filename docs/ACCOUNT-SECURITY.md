# Account security · v0.2.0

## Upgrade from the foundation

Stop the dev processes with Ctrl+C. Back up the database and root .env. Extract the cumulative source over the existing project in the same Compose directory, keeping the existing .env and database volume. Use Node 22 and Docker Desktop with Linux containers. Run these commands from the folder containing package.json.

```powershell
npm ci
npm run setup
docker compose up -d
docker compose ps
npm run db:generate
npm run db:migrate
npm run db:check
npm run dev
```

Wait for PostgreSQL to be healthy before migrating. Setup adds a random encryption key when missing. Every API process must use the same MFA_ENCRYPTION_KEY. Preserve it with your backups because existing authenticator secrets depend on it. For a new installation use the same commands in the newly extracted folder.

If db:check reports a privileged account, make DATABASE_URL point to hris_app on the same database as MIGRATION_DATABASE_URL. The latter uses the migration owner. DATABASE_URL must contain the URL-encoded form of APP_DB_PASSWORD if it includes reserved characters. In Windows Command Prompt, clear an unintended inherited override with `set DATABASE_URL=` before retrying from the same terminal. An authentication error during migration requires checking the existing database owner's credentials. Rerun db:migrate and db:check after correcting configuration.

Open http://localhost:3000. Open Account security after sign-in, supply your password and enter the manual setup key in an authenticator using time-based codes. Enter a current six-digit code and save the eight recovery codes shown once. At your next sign-in use the next available authenticator code or one unused recovery code. Each recovery code is consumed once. If using recovery codes to regain access and then disable MFA, reserve a second unused code for disablement. Password reset alone does not remove MFA. Session management shows active sessions and allows revoking another session. Enabling or disabling MFA signs out all other sessions. Invitation and membership administration require an MFA-verified session.

## Implementation

The incremental Prisma migration adds optional enrollment fields to users and public handles and factor timestamps to sessions. Existing users can sign in with their password until enrollment. The account controller holds a PostgreSQL user-row lock while confirming enrollment or consuming a factor. This serializes concurrent submissions across API processes. TOTP seeds are AES-256-GCM encrypted with the user ID as associated data. Only recovery hashes are stored. Pending enrollment expires after ten minutes. PostgreSQL also coordinates account attempt budgets across API instances.

The web account screen uses the authenticated API under /api/v1/account. GET security returns MFA status and session handles. POST enroll takes a password and returns the manual key. POST confirm takes a code and returns recovery codes. POST disable takes a password and factor. POST sessions/:handle/revoke revokes another session belonging to the caller. The login endpoint returns requiresMfa when an enrolled user supplies a valid password alone. Its second submission includes the factor before session issuance.

## Build and verification

With infrastructure running and migrations applied, run:

```powershell
npm run build
npm run typecheck
npm test
```

To run the compiled system, stop npm run dev and start each of these in its own terminal:

```powershell
npm run start -w @hris/api
npm run start -w @hris/worker
npm run start -w @hris/web
```

The release passed the production build, workspace type checks, six unit tests, and 47 integration assertions using PostgreSQL and two API processes. Coverage includes concurrent recovery-code consumption, session revocation, membership restrictions and existing tenant isolation. See RUN-AND-BUILD.md for the dedicated integration database instructions. Browser authenticator entry and the Windows/Docker Desktop startup sequence require local verification.
