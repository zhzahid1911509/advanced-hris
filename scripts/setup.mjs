import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
if (existsSync('.env')) { if (!/^\s*MFA_ENCRYPTION_KEY\s*=/m.test(readFileSync('.env','utf8'))) {
    appendFileSync('.env', '\nMFA_ENCRYPTION_KEY='+randomBytes(32).toString('hex')+'\n');
    console.log('Added MFA encryption key to existing configuration.');
  } process.exit(0); }
const secret = () => randomBytes(24).toString('hex');
const owner=secret(), app=secret();
writeFileSync('.env', `POSTGRES_PASSWORD=${owner}\nAPP_DB_PASSWORD=${app}\nDATABASE_URL=postgresql://hris_app:${app}@localhost:5432/hris\nMIGRATION_DATABASE_URL=postgresql://postgres:${owner}@localhost:5432/hris\nREDIS_URL=redis://localhost:6379\nAPP_ORIGIN=http://localhost:3000\nAPI_INTERNAL_URL=http://127.0.0.1:4000\nAPI_PORT=4000\nSMTP_HOST=localhost\nSMTP_PORT=1025\nMAIL_FROM=HRIS <no-reply@hris.local>\nCOOKIE_SECURE=false\nREGISTRATION_ENABLED=true\nMFA_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`);
console.log('Created .env with random database passwords. Run docker compose up -d, then npm run db:migrate.');
