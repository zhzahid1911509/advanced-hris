# Verification report — v0.1.0

These notes cover the v0.1 foundation. See [the v0.2 account security supplement](ACCOUNT-SECURITY.md) for current behavior and verification.


Verified on 12 November 2026. Tests use synthetic records only.

| Check | Result | Evidence / limits |
|---|---|---|
| Prisma client generation | PASS | Prisma 6.19.3 with deepmerge-ts security override |
| Migration runner | PASS | Fresh migration and repeated no-op migration; restricted runtime grants |
| API TypeScript build | PASS | NestJS application compiled |
| Worker TypeScript build | PASS | BullMQ worker compiled |
| Next.js production build | PASS | Optimized webpack build, type checking and page generation |
| Workspace type checks | PASS | All three applications |
| Unit tests | 4 PASS | Calendar validity, strict self-service schema, role denial and token digests |
| Real DB/API integration | 35 assertions PASS | Two separate API processes against one PostgreSQL database |
| Worker integration | 3 assertions PASS | Local SMTP accepted, notification replay deduplicated, delivered email body redacted |
| Dependency audit | PASS at verification time | npm audit --omit=dev: 0 reported vulnerabilities; rerun before deployment |
| Browser inspection | PARTIAL | Login screenshot and registration form/layout/navigation inspected |
| Docker application build | NOT RUN | Docker executable unavailable in delivery environment |
| Native/physical mobile devices | NOT RUN | Responsive breakpoints supplied, device matrix remains pending |
| Full authenticated browser E2E | NOT RUN | Authentication/employee/approval workflows verified by real API integration, not a complete browser suite |
| Load, penetration, disaster recovery | NOT RUN | Later qualification work, no capacity or security certification claimed |

Integration environment: Node 24.22.1, PostgreSQL 18.6 embedded binary (real PostgreSQL, not an in-memory SQL substitute). Local Compose and CI target PostgreSQL 17; the supplied CI config has not been run on GitHub during this delivery. Redis delivery tests used a local Redis server binary and a local SMTP test server rather than external provider credentials.

## Integration assertions

- Anonymous and cross-origin mutations denied.
- Unverified sign-in denied and verification token replay rejected for two tenants.
- Forged tenant headers and CSRF tokens rejected.
- Cross-tenant unit assignments and guessed employee identifiers denied.
- Tenant B cannot see tenant A's employees.
- Duplicate employee identifiers and stale versions rejected.
- Employee self-only listing, mutation denial and audit denial.
- Pending contact requests do not change employee records.
- A partial unique index permits only one pending request per employee.
- Two API processes racing the same approval yield one success and one conflict.
- Employee version, audit and notification intents reflect one committed approval.
- Direct runtime SQL with missing/wrong tenant context returns no employee rows.
- Composite foreign keys reject cross-tenant relations even through direct SQL.
- Runtime role cannot delete audit records.
- Stale profile approval rolls back its request decision.
- HR cannot approve its own request.
- Auditors do not receive private contact fields.
- Membership suspension takes effect with an existing session.
- Reset revokes existing sessions; reset token replay denied; logout invalidates session.

The worker check verifies database-level notification deduplication on replay. It does not claim exactly-once SMTP delivery; that limitation is documented in DEVELOPER-GUIDE.md.

## Reproduce

Use RUN-AND-BUILD.md for the separate test database and two-process API command. Run `npm test`, `npm run test:integration`, and the optional worker integration command. CI includes generation, migrations, builds, type checks, unit/API tests and dependency audit. Never run integration tests against real HR data.
