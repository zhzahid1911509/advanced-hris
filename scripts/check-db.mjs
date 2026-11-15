import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
try {
  await client.connect();
  const {rows:[role]} = await client.query('SELECT current_user AS account, current_database() AS db, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
  console.log('Database:',role.db,'Runtime account:',role.account);
  if (role.account !== 'hris_app' || role.rolsuper || role.rolbypassrls) {
    throw new Error('Use the restricted hris_app role in DATABASE_URL. Check terminal overrides.');
  }
  await client.query('SELECT "mfaSecret" FROM users LIMIT 0');
  await client.query('SELECT handle,"factorAt" FROM sessions LIMIT 0');
  await client.query('SELECT id FROM public.auth_mail LIMIT 0');
  await client.query('SELECT "showPhone" FROM public.directory_policies LIMIT 0');
  await client.query('SELECT id FROM public.directory_delegations LIMIT 0');
  await client.query('SELECT id FROM public.employee_documents LIMIT 0');
  console.log('Runtime role, employee documents, delegations, account security, mail queue and directory policies verified.');
} catch (e) {
  console.error(e.code === '28P01' ? 'Login rejected. Check DATABASE_URL and APP_DB_PASSWORD, then run npm run db:migrate.' :
    e.code === '42703' || e.code === '42P01' ? 'Apply the project migrations with npm run db:migrate.' :
    e.code ? 'Database check failed ('+e.code+').' : e.message);
  process.exitCode=1;
} finally { await client.end(); }
