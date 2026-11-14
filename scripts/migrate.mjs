import 'dotenv/config';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
const { MIGRATION_DATABASE_URL, APP_DB_PASSWORD } = process.env;
if (!MIGRATION_DATABASE_URL || !APP_DB_PASSWORD || APP_DB_PASSWORD.length < 16) throw new Error('Set MIGRATION_DATABASE_URL and an APP_DB_PASSWORD of at least 16 characters.');
const db = new pg.Client({connectionString:MIGRATION_DATABASE_URL});
await db.connect();
// SQL identifiers are fixed. Password is escaped as a SQL literal, never interpolated unescaped.
const password = "'" + APP_DB_PASSWORD.replaceAll("'", "''") + "'";
await db.query("SELECT pg_advisory_lock(72839410)");
try {
 const identity = await db.query('SELECT current_user AS name');
 if (identity.rows[0].name === 'hris_app') {
   throw new Error('MIGRATION_DATABASE_URL must use a separate schema owner. Use hris_app only for DATABASE_URL.');
 }
 const found = await db.query(`
   SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
   FROM pg_roles WHERE rolname = 'hris_app'
 `);
 if (found.rowCount === 0) {
   await db.query('SET standard_conforming_strings = on');
   await db.query('CREATE ROLE hris_app LOGIN PASSWORD ' + password);
 } else {
   const role = found.rows[0];
   if (!role.rolcanlogin || role.rolsuper || role.rolbypassrls || role.rolcreatedb ||
       role.rolcreaterole || role.rolreplication) {
     throw new Error('Existing hris_app must be a restricted login. Ask the database administrator to correct its role attributes before retrying.');
   }
 }
 const command=process.platform==='win32'?'npx.cmd':'npx';
 const result=spawnSync(command,['prisma','migrate','deploy','--schema','database/schema.prisma'],{stdio:'inherit',env:{...process.env,DATABASE_URL:MIGRATION_DATABASE_URL},shell:process.platform==='win32'});
 if(result.status!==0) throw new Error('Migration failed; runtime grants were not changed.');
 await db.query('GRANT USAGE ON SCHEMA public TO hris_app');
 await db.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hris_app');
 await db.query('REVOKE ALL ON _prisma_migrations FROM hris_app');
 await db.query('REVOKE UPDATE, DELETE, TRUNCATE ON audit_events, employee_events FROM hris_app');
 console.log('Migrations complete. Runtime table grants applied. Run npm run db:check to verify the configured runtime login.');
} finally { await db.query('SELECT pg_advisory_unlock(72839410)'); await db.end(); }
