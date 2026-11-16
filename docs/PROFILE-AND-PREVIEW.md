# Profile photos, PDF preview and loading · v0.8.0

## Use the features

- Use the eye button in sign-in, workspace registration, password reset, invitation acceptance and the current-password field under Account security. Toggle it again to conceal the value. Form values and password-manager autocomplete remain available.
- Open your account from the bottom of the sidebar to upload, replace or remove your profile photo. A linked employee's profile displays that account photo. A workspace administrator can open Organization and upload or remove its photo. Empty photos use the existing initials.
- Open People → employee profile → Private documents. For a READY PDF select Preview. The embedded viewer includes a new-tab link for browsers with limited PDF support. Close the viewer and select Preview again to obtain a fresh URL. Existing download and release diagnostics remain available.
- Overview, People and Organization fetch unit data concurrently with their view data. Other views skip that request. Navigation cancels obsolete view fetches. Document actions use returned metadata or a signed URL directly, avoiding an extra metadata list request per action. Profile reads skip timeline retrieval for roles that cannot see timelines. Initial account and membership queries run concurrently. Processing feedback is displayed during document operations. Actual latency depends on database placement, scan time and object storage.

## Implementation

The photos migration adds nullable thumbnail fields to tenants and users. The API accepts JPEG, PNG and WebP up to 2 MiB and 25 megapixels. Sharp decodes the file, corrects orientation, crops a 192 × 192 square, and re-encodes WebP. Only the thumbnail is persisted in PostgreSQL. An account photo follows the user across their workspaces and is visible on their linked employee profile to authorized directory viewers. The organization image belongs to one tenant. Neither feature requires additional object storage settings.

PUT /api/v1/photos/account applies only to the authenticated account. PUT /api/v1/photos/organization requires the active workspace's ADMIN role and writes an audit event. Both mutations use the existing session and CSRF protection. The JSON body contains content with the base64-encoded source image or null to remove it.

POST /api/v1/employees/:employeeId/documents/:id/preview uses the existing download authorization and READY status check. It issues an inline PDF URL valid for 60 seconds and audits issuance separately. The download endpoint continues to issue an attachment URL. Previously transferred bytes can remain visible after a signed URL expires.

Key files include apps/api/src/photos.ts, apps/api/src/documents.ts, apps/web/app/profile-controls.tsx, apps/web/app/employee-documents.tsx and apps/web/app/page.tsx. The v0.7 release diagnostics and scanner probe are included.

## Run on Windows

Stop dev with Ctrl+C. Back up PostgreSQL and the root .env. Copy the extracted advanced-hris contents into the existing project folder, retaining your working Neon, SMTP, Redis, ClamAV, storage and MFA settings. Use Node 22 and start existing infrastructure. For the supplied local scanner, run docker compose --profile documents up -d clamd. For fresh all-local infrastructure use docker compose --profile documents up -d after setup, then wait for PostgreSQL to become healthy.

In the project root:

```powershell
npm ci
npm run setup
npm run db:generate
npm run db:migrate
npm run db:check
npm run dev
```

From v0.7 expect 202611160001_photos. Open http://localhost:3000. No new environment variables are required. See RUN-AND-BUILD.md for a new installation and EMPLOYEE-DOCUMENTS.md for private storage setup.

## Build and test

Stop dev and run:

```powershell
npm run build
npm run typecheck
npm test
```

Start each compiled workspace in a separate terminal:

```powershell
npm run start -w @hris/api
npm run start -w @hris/worker
npm run start -w @hris/web
```

Use npm run test:integration only with a dedicated migrated database; it writes fixtures and modifies rate limits.
