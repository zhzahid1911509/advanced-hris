# API reference — v0.1.0

These notes cover the v0.1 foundation. See [the v0.2 account security supplement](ACCOUNT-SECURITY.md) for current behavior and verification.


Base path `/api/v1`. OpenAPI route explorer at `/api/docs`; this file supplies request/response shapes where the explorer's generated schemas are minimal. Errors return `{statusCode, message, requestId}` except middleware errors, which return message/requestId. Mutations use JSON and an Origin exactly matching APP_ORIGIN. Authenticated mutations additionally use `x-csrf-token`. Scoped endpoints also require `x-tenant-id` from the authenticated `/auth/me` response. Sessions use the `hris_session` cookie.

| Method / path | Body / query | Result / access |
|---|---|---|
| GET `/health` | None | DB readiness and version |
| POST `/auth/register` | name,email,password,organization,slug | Verification email; registration must be enabled |
| POST `/auth/verify` | token | Activates verified email |
| POST `/auth/resend-verification` | email | Generic eligibility response |
| POST `/auth/login` | email,password | Session cookie, user and CSRF |
| GET `/auth/me` | Session cookie | User, CSRF, active organizations and roles |
| POST `/auth/logout` | `{}` | Revokes presented session |
| POST `/auth/logout-all` | `{}` | Revokes every user session |
| POST `/auth/forgot-password` | email | Generic response; email queued |
| POST `/auth/reset-password` | token,password | Resets password and revokes sessions |
| POST `/auth/accept-invite` | token,name,password | New account or proof of existing password; membership created |
| GET `/dashboard` | Scoped headers | Live counts, recent employees |
| GET `/units` | Scoped headers | Branch/department list |
| POST `/units` | name, kind: BRANCH/DEPARTMENT | Admin/HR creates unit |
| PATCH `/units/:id` | name | Admin/HR renames |
| GET `/employees` | search, page (20 per page) | items,total,page,pageSize |
| POST `/employees` | Employee input below | Admin/HR creates |
| GET `/employees/:id` | Scoped headers | Record + latest 50 timeline events; employee self-only |
| PATCH `/employees/:id` | Employee input + version + reason | Admin/HR; 409 on stale version |
| POST `/employees/:id/invite` | role: HR/EMPLOYEE/AUDITOR | Admin queues invitation |
| POST `/profile-requests` | employeeId,version,changes | Own linked record; changes limited to contact fields |
| GET `/profile-requests` | Scoped headers | Latest 100; restricted to own for employee |
| POST `/profile-requests/:id/decision` | decision: APPROVED/REJECTED,reason | Independent HR/admin; transactional |
| GET `/audit` | Scoped headers | Latest 100; admin/HR/auditor |
| GET `/notifications` | Scoped headers | Own latest 50 |
| POST `/notifications/:id/read` | `{}` | Mark own notification read |
| GET `/members` | Scoped headers | Admin only |
| PATCH `/members/:id` | role: HR/EMPLOYEE/AUDITOR,active:boolean | Admin only; admin/self changes blocked |

Employee input example (replace IDs with your tenant's unit IDs or null):

```json
{
  "employeeNo": "EMP-001",
  "name": "Example Employee",
  "email": "employee@example.com",
  "title": "Software Engineer",
  "category": "PERMANENT",
  "status": "ACTIVE",
  "joinedOn": "2026-11-01",
  "branchId": null,
  "departmentId": null,
  "phone": "",
  "address": "",
  "emergencyContact": ""
}
```

Categories: PERMANENT, CONTRACT, TEMPORARY, PROBATION, PART_TIME, INTERN, OUTSOURCED. Status: ACTIVE, ON_LEAVE, INACTIVE. Dates are strict YYYY-MM-DD calendar values. PATCH sends the complete employee form plus numeric version and a reason of at least five characters. Unknown fields are rejected. Linked account email changes are deliberately blocked in v0.1.

A contact request's `changes` object includes exactly phone/address/emergencyContact (empty strings permitted). Duplicate pending requests return 409. A stale approval returns 409 and leaves the request pending so the reviewer can reject it and request resubmission.
