# Private employee documents · v0.7.0

## Upgrade and run on Windows

Stop the dev processes. Back up PostgreSQL and the root .env, then copy the cumulative source into the existing advanced-hris project folder. Keep the working Neon owner and runtime URLs, Redis, SMTP and MFA settings. Use Node 22. From the project root run npm ci, then npm run setup. For a fresh installation, see RUN-AND-BUILD.md for the foundation services.

1. Provision a private general-purpose S3 bucket or a private S3-compatible bucket. In AWS, keep Block Public Access enabled. Use a dedicated bucket or restrict the API credential to this application's objects. The API needs GetObject and PutObject. Set the actual bucket region. The file bodies of released versions live here, so include the bucket as well as PostgreSQL in backup and retention planning.
2. In the existing root .env, add the following settings. For AWS S3 leave DOCUMENT_S3_ENDPOINT empty. For compatible storage use its HTTPS S3 API endpoint, reachable from both the API and the downloading browser. Use a private bucket and keep all credentials server-side.

```dotenv
DOCUMENT_S3_BUCKET=your-private-bucket
DOCUMENT_S3_REGION=us-east-1
DOCUMENT_S3_ENDPOINT=
DOCUMENT_S3_KEY=your-access-key
DOCUMENT_S3_SECRET=your-secret-key
DOCUMENT_CLAMD_HOST=127.0.0.1
DOCUMENT_CLAMD_PORT=3310
```

3. Start Docker Desktop. For an existing hosted PostgreSQL setup, start only the scanner and your usual local supporting services. The scanner listens on loopback port 3310 on the host. When the API itself runs in the supplied Docker network, it uses the service name clamd. If using an existing private remote scanner, set its hostname and port instead. Keep clamd on a trusted private network.

```powershell
docker compose --profile documents up -d clamd
docker compose logs --tail=30 clamd
```

Allow time for the first antivirus definition download and daemon startup. The scanner needs outbound access for definition updates. Keep the application on its usual Redis and mail configuration.

4. Apply the migration and run from the project root:

```powershell
npm run db:generate
npm run db:migrate
npm run db:check
npm run dev
```

From v0.6.0 expect migration 202611150005_employee_documents. Open http://localhost:3000. Open People, choose an employee, then use Private documents on their profile. An administrator or HR member can manage documents for the tenant. Other roles can manage their own linked employee's documents. Upload a PDF up to 2 MiB and optionally enter its expiry date. Reusing the exact same filename creates a new numbered version. Each version has its own scan result and download action.

## State and access

| State | Meaning | Action |
|---|---|---|
| QUARANTINED | Bytes are stored in PostgreSQL pending a successful scan and private storage write | Check scanner and storage setup, then select Retry scan and release |
| READY | ClamAV returned an explicit clean verdict and the object store accepted the write | Request a 60-second download link |
| REJECTED | Scanner reported a detection; quarantine bytes were discarded | Upload a corrected version |

The expiry date is document metadata (for example, the date a certificate expires). It does not delete the record or prohibit downloading its history. Anyone who already has an issued download link can use it until its 60-second lifetime ends. Directory access through a branch, team, custom role or delegation does not grant document access. Storage credentials and object keys are never accepted as user input.

## Architecture and consistency

The API checks employee access and validates the upload size, extension, PDF header and end marker. These are format checks; malware screening uses the ClamAV INSTREAM protocol. A tenant-filtered transaction saves the content in a private quarantine column and records an audit event. A UUID upload ID makes identical requests idempotent. A per-employee and filename transaction lock serializes version allocation. Reusing an ID with different content or metadata is rejected.

Scanning runs outside database transactions. An unavailable scanner, unrecognized verdict, or unsuccessful object write leaves the document quarantined for manual retry. Clean bytes are written to an immutable-per-version key before the conditional READY update. A retry after interruption writes the same bytes to the same key. Terminal status and the corresponding audit event are committed together and the quarantine bytes are cleared. Downloads recheck live employee access, require READY and record signed-link issuance. The HTTP response does not disclose quarantine data.

| Route under /api/v1/employees/:employeeId/documents | Contract |
|---|---|
| GET | Return version metadata only |
| POST | id (UUID), name (.pdf), content (base64), expiresOn (YYYY-MM-DD or null) |
| POST :id/retry | Retry scanner and storage for a quarantined version |
| POST :id/download | Issue a short-lived private attachment URL for a released version |

Core files are apps/api/src/documents.ts, apps/api/src/document-storage.ts, apps/web/app/employee-documents.tsx and database/schema.prisma. The tests use a real PostgreSQL database, two API processes, a controlled ClamAV protocol endpoint, and a controlled S3 HTTP endpoint. The fixtures exercise application transitions and request signing. Verify your real scanner and bucket credentials with an upload and download before rollout.

## Build

Stop npm run dev and run:

```powershell
npm run build
npm run typecheck
npm test
```

Start each compiled workspace in its own terminal, with infrastructure running:

```powershell
npm run start -w @hris/api
npm run start -w @hris/worker
npm run start -w @hris/web
```

Use a dedicated migrated test database for npm run test:integration. The tests write fixtures and change rate-limit counters.
