# Developer guide

## Architecture

One business backend with independently runnable web, API and worker processes. The web app uses same-origin `/api/v1` requests through Next rewrites; only NestJS writes business records. Prisma uses PostgreSQL. A transaction-local `app.tenant_id` controls RLS. Redis is delivery infrastructure, never the authoritative employee or approval store.

| Path | Responsibility |
|---|---|
| `apps/web/app/page.tsx` | Authentication modes, workspace shell, employee forms/directory/detail, organization, approvals, access and notifications |
| `apps/web/app/globals.css` | Responsive design system, themes and modal/table layouts |
| `apps/web/next.config.mjs` | Same-origin API routing and response headers |
| `apps/api/src/main.ts` | Nest bootstrap, middleware, shared DB rate limiter, centralized errors, health/OpenAPI |
| `apps/api/src/config.ts` | Root environment loading and HTTPS/secure-cookie production guard |
| `apps/api/src/auth.ts` | Registration, verification, password recovery, sessions and invitations |
| `apps/api/src/security.ts` | Session/tenant guards, role checks, random tokens and digests |
| `apps/api/src/db.ts` | Prisma client, tenant transaction, audit/event/outbox helpers |
| `apps/api/src/validation.ts` | Input schemas, strict field allowlists and calendar validation |
| `apps/api/src/people.ts` | Organization/people/approval/access/audit/notification use cases |
| `apps/worker/src/main.ts` | Outbox dispatcher and BullMQ delivery worker; redacted failure logs |
| `database/schema.prisma` | ORM model declarations |
| `database/migrations/.../migration.sql` | Physical schema, RLS, composite FKs, checks and partial unique index |
| `scripts/setup.mjs` | Creates local `.env` with random DB passwords, never overwrites existing configuration |
| `scripts/migrate.mjs` | Owner-authorized migration and restricted runtime role provisioning |
| `scripts/retry-delivery.mjs` | Operator retry of a specified failed delivery job |
| `tests` | Unit, real API/DB concurrency and worker verification |

## Tenant transaction pattern

Every tenant use case first authenticates a session, checks membership and resolves the role. `tenantTx` rechecks membership and sets tenant context inside an interactive transaction. The transaction's pooled connection carries that setting; the setting disappears on commit/rollback. Runtime SQL without a context sees no tenant business rows.

Global control-plane tables (tenant directory, users, memberships, sessions, auth tokens, auth mail, limiter) are intentionally outside tenant RLS to allow pre-login lookup. Their handlers must always enforce explicit user/tenant scoping. They are not directly exposed as arbitrary CRUD APIs. RLS is defense in depth, not a substitute for application authorization or protection from a fully compromised application.

## Approval transaction

Read pending request → ensure reviewer is independent → conditional state update requiring PENDING → employee update requiring original version → timeline/audit/outbox insert → commit. If employee update fails, the decision update rolls back. Concurrent API processes contend at the database; there is no in-memory lock whose protection disappears on another process.

## Jobs and retries

API writes notification intents alongside business data. Dispatcher polls unsent intent IDs and enqueues deterministic BullMQ job IDs. Notification consumer creates the notification with a unique source ID and marks the outbox delivered in one transaction. Redis loss does not lose pending DB intent. Keep Redis `noeviction` and persistence for operational reliability.

Email sends are at-least-once: SMTP may accept a message immediately before a process crash, so a retry can deliver it again. A stable Message-ID helps trace it but does not guarantee provider deduplication. After success the DB body containing the link token is redacted. Tokens themselves are stored hashed, one-use and expiring.

Failed jobs remain in Redis for seven days. Use the retry script after fixing SMTP/Redis availability. Do not delete all queues as a routine repair. The initial dispatcher scans tenants each cycle; large-scale batching and fairness need optimization before enterprise load.

## Schema evolution

Do not use `prisma db push` on this project: it does not represent the custom RLS and security SQL workflow. Author a new migration, review it, then run the migration script. Do not edit a migration already applied to an existing installation. Prisma's schema omits relationship navigation fields; SQL foreign keys are authoritative and must be preserved when generating future diffs.

Use a separate owner/migration credential. Runtime must not own tables, be a superuser or have BYPASSRLS. The API/worker reject superuser/BYPASSRLS credentials at startup. Production migrators should be more narrowly provisioned than the local postgres owner.

## Design decisions for this slice

- Keep NestJS modules but use small module-local functions for use cases; extract repository/domain classes as modules grow. Avoid inventing unused abstraction layers.
- Use built-in React form/state and CSS for this bounded release. The roadmap's TanStack Query, React Hook Form and shared Tailwind/shadcn packages can be introduced when their reuse justifies dependencies; these are documented deviations, not claims of already implementing that tooling.
- Use Prisma 6.19.3 with a tested `deepmerge-ts` 8 override to resolve the dependency advisory while retaining the v6 transaction API. Both migrations and generation are verified. Revisit the ORM upgrade as a separate change.
- Client code never stores sessions in localStorage. Only theme/language preference persists there. Tenant data stays in memory and is discarded on tenant switch/logout.
- Schema and backend are independently deployable; no external hosted Site or user repository was created.
