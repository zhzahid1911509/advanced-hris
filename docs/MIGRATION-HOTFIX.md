# Existing runtime role on managed PostgreSQL

The v0.2.0 migration attempted to set NOSUPERUSER on every run. PostgreSQL rejects this command for a non-superuser even when hris_app is already restricted. The corrected script reads the existing role attributes, requires a restricted login, and preserves its password. When the role is missing, it creates a login with the PostgreSQL default restrictions using APP_DB_PASSWORD. A database administrator may provision that role separately when the schema owner lacks CREATEROLE.

Stop the dev server and replace scripts/migrate.mjs with the copy in this patch. Keep the current database, root .env and application source. MIGRATION_DATABASE_URL must use the schema owner. DATABASE_URL must connect to the same database using hris_app and its actual password. For a previously created login, changing APP_DB_PASSWORD and rerunning migrations no longer resets its password. Manage password changes through the database administrator and update the environment to match.

From the project root run npm run db:migrate, npm run db:check, then npm run dev. To build, stop dev and run npm run build. This patch changes the migration runner only and requires no new npm dependencies. Use the existing project's README for a clean installation.
