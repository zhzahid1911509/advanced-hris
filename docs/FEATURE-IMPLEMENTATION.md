# Feature implementation — v0.1.0

## Release boundary

This release implements a working slice of Phase 2 and basic Core HR from Phase 3A. It is suitable for local evaluation and continued development. It is not an enterprise-production completion claim. Planned modules are not displayed as working placeholders.

| Feature | Implemented behavior | Main files |
|---|---|---|
| Organization registration | Creates independent tenant and administrator; unique slug | `apps/api/src/auth.ts` |
| Email verification | One-use, hashed, expiring tokens; resend; sign-in blocked until verified | `auth.ts`, worker |
| Sign-in / sign-out | Argon2id passwords; random opaque session cookie; 12-hour expiry; logout and all-device revocation | `auth.ts`, `security.ts` |
| Password reset | Generic request response; expiring one-use token; invalidates all sessions | `auth.ts` |
| Multi-tenancy | Validated membership context; server predicates; forced PostgreSQL RLS; tenant-qualified foreign keys | `db.ts`, migration SQL |
| Roles | ADMIN, HR, EMPLOYEE, AUDITOR; employee self-only access; contact fields masked for auditors | `security.ts`, `people.ts` |
| Access administration | Invite HR/employee/auditor; accept using new account or existing password; suspend/restore/change non-admin role | `auth.ts`, `people.ts` |
| Organization units | Create/list/rename branches and departments; assign to employee | `people.ts` |
| Employee records | Create, search, page, view and edit employee number/name/email/job title/category/status/join date/organization/contact fields | `people.ts`, `validation.ts` |
| Change protection | Positive version guard rejects stale updates; unique numbers/email; edit reason required | `people.ts`, migration SQL |
| Employee timeline | Append-only creation, update-reason and approved-contact events | `employee_events` |
| Self-service | Employee sees own linked record and requests phone/address/emergency-contact update | `profile_requests` |
| Approval slice | Independent HR/admin review; one pending request; stale employee version blocks approval; race-safe transaction | `people.ts` |
| Notifications | Durable outbox → Redis job → in-app notification; mark read; database deduplication | worker, `outbox`, `notifications` |
| Email delivery | Durable auth mail queue, exponential retries, delivered-body redaction, failed-job retry script | worker, `scripts/retry-delivery.mjs` |
| Audit | Append-only application/runtime audit; action, actor, record, reason, changed-field names and versions | `audit_events` |
| Real dashboard | Scoped employee/active/unit/pending counts and recent records | `people.ts`, web page |
| UI | Responsive layouts, working modal/forms, loading/empty/error states, light/dark mode, basic Bangla navigation switch | web app |
| Infrastructure | Lockfile, setup/migrations, Docker Compose, optional application image, CI workflow, tests | root, `infra`, `.github` |

Employee status is a personnel record field. **Inactive status does not itself suspend account access**; administrators manage login authorization in Access control. This separation avoids silently conflating employment history with identity state. Full lifecycle/offboarding automation is a later module.

## Functional workflow

1. Register organization → email queued → worker sends → administrator verifies → signs in.
2. Create organization units → create employee → invite employee → accept invitation → sign in.
3. Employee opens own profile → requests contact changes → current record stays unchanged.
4. Independent HR/admin approves → request state, employee version, audit, timeline and outbox commit atomically.
5. Worker delivers notifications. Replaying the same notification intent does not create a second row.
6. Administrator can suspend membership; subsequent scoped API calls are rejected even with an unexpired session.

## Permission matrix

| Action | ADMIN | HR | EMPLOYEE | AUDITOR |
|---|---|---|---|---|
| See employee list/details | Tenant | Tenant | Own linked record | Tenant, private contact fields omitted |
| Create/edit employee | Yes | Yes | No | No |
| Create/rename organization units | Yes | Yes | No | No |
| Request own contact change | When linked | When linked | Yes | When linked |
| Review other users' contact requests | Yes | Yes | No | No |
| See request changes | Tenant | Tenant | Own | Request metadata only |
| View audit | Yes | Yes | No | Yes |
| Invite / change member access | Yes | No | No | No |
| Notifications | Own | Own | Own | Own |

The admin account is protected from role/suspension changes in this release. Custom roles, additional role templates, delegated access and branch/team permission scopes are not implemented yet.

## Explicitly deferred

- MFA/SSO, device/session listing, automated suspicious-login response, per-account lockout and custom RBAC/field policies.
- Legal entities within a tenant; hierarchical departments, positions, grades and org chart; effective-dated employment/compensation history.
- Documents/S3 uploads/quarantine/malware scanning; contracts, dependants/nominees, NID/passports/bank records; imports/exports; custom fields/forms; full bilingual documents.
- Generic versioned approval engine, parallel/conditional workflows, visual builder, delegation/escalation; current approval logic only handles employee contact requests.
- Attendance, shifts, leave balances, payroll/tax/benefits, bank files/payments and settlement.
- Recruitment, onboarding/offboarding, performance, learning, activities, expenses/loans, assets, engagement, report builder, AI and external integrations.
- PWA install/offline/push/native packaging; current delivery is a responsive web application.
- Full English/Bangla translation: the switch currently localizes navigation and selected actions; forms and API errors remain English.
- External tamper-evident audit storage, automated backups/restore UI and restoration drills, load/penetration/full accessibility certification.

All deferred items remain in the original roadmap. No Bangladesh legal/tax compliance claim is made by this release.
