# Versioned employee contact approvals · v0.9.0

## Use the feature

Open Approvals as an administrator with a verified MFA session. Select a route and publish a new version. New requests use that version. Existing submissions retain the route and eligible reviewers recorded at submission.

| Route | Required decisions |
|---|---|
| HR or administrator | One independent HR member or administrator |
| HR, then administrator | An HR member approves before a different administrator |
| HR and administrator in either order | One independent reviewer in each role; either role can act first |
| Emergency contact changes require HR, then administrator | A changed emergency contact triggers ordered dual review. Otherwise a single independent reviewer suffices. |

Invite and activate an HR member before publishing a dual or conditional route. At submission the API excludes the requester and checks that the resolved route can be staffed. Only active members who retain their original reviewer role and appear in the assigned candidate set may decide. Requests already pending on v0.8 retain the original single-review behavior and live HR/admin eligibility.

As an employee, open your linked People profile and submit a contact change. Reviewers receive in-app notification intents when their stage opens. View progress and review reasons under Approvals. A rejection closes the request immediately. Final approval applies the proposed changes only if the employee version still matches. If the underlying profile changes, a reviewer can reject or the requester can withdraw and refresh the proposal. Withdraw is also available when an assigned reviewer leaves. Revise and resubmit links a new request to its predecessor, retains the old history and resolves the current published policy. Only one direct revision per predecessor and one pending request per employee are allowed.

## Architecture

profile_workflows stores immutable published tenant versions, protected by forced tenant row-level security. v1 is the built-in single-review default. Publishing serializes changes within a tenant and checks the version presented by the administrator. profile_requests stores the publication version, resolved mode, candidate snapshot, decision history, review revision and optional predecessor. Publication and approval changes are audited. Existing records gain v1 defaults when upgraded.

A decision uses the current authenticated tenant membership, validates reviewer eligibility and separation of duties, and conditionally updates the pending request at its current revision. A partial approval records the review without modifying the employee. The final review, employee version check, employee update, audit and notification intent commit together. The same transaction rolls back on conflict. Simultaneous reviewers of an either-order route may both open the same revision; after one commits, the other refreshes before acting.

| Endpoint under /api/v1 | Purpose |
|---|---|
| GET profile-workflow | Read current policy as workspace administrator |
| POST profile-workflow | Publish with current version and mode (EITHER, HR_THEN_ADMIN, BOTH, EMERGENCY_CHANGE) |
| POST profile-requests | Submit changes, current employee version and optional previousId |
| GET profile-requests | Get visible requests with workflow version, route, history and canReview |
| POST profile-requests/:id/decision | APPROVED or REJECTED, reason and current request revision |
| POST profile-requests/:id/withdraw | Requester closes their pending request at the supplied revision |

Review clients should send the request revision. Existing v0.8 decision clients may omit it; the API still guards the database update against concurrent decisions. The contact workflow is the first versioned workflow. Directory delegation grants no approval rights. Approval delegation, timed escalation, arbitrary workflow graphs, and payroll or leave integration remain future work.

## Upgrade and run on Windows

Stop npm run dev and back up PostgreSQL and the root .env. Extract the cumulative source into the existing project folder. Preserve the current Neon owner/runtime URLs, object store, MFA, SMTP, Redis and ClamAV settings. Use Node 22. No new environment variables are required. For fully local installations start Docker Desktop and the configured Compose services after setup. Keep your existing hosted services when upgrading Neon.

From the project root:

```powershell
npm ci
npm run setup
npm run db:generate
npm run db:migrate
npm run db:check
npm run dev
```

Expect 202611160002_profile_workflows and 202611160003_request_withdrawal from v0.8. Open http://localhost:3000. For a fresh setup follow RUN-AND-BUILD.md.

Stop dev before building:

```powershell
npm run build
npm run typecheck
npm test
```

With backing services available, start each command in a separate terminal:

```powershell
npm run start -w @hris/api
npm run start -w @hris/worker
npm run start -w @hris/web
```

Run npm run test:integration only against a dedicated migrated test database. Tests create fixtures and modify rate limits. Core code lives in apps/api/src/profile-workflows.ts, apps/api/src/people.ts, database/schema.prisma and apps/web/app/page.tsx.
