# Security design and limits

These notes cover the v0.1 foundation. See [the v0.2 account security supplement](ACCOUNT-SECURITY.md) for current behavior and verification.


Implemented: Argon2id password hashing; high-entropy opaque sessions stored as SHA-256 digests; HttpOnly SameSite=Lax cookies; configurable Secure cookies; strict request Origin checks and session CSRF header; global database-backed rate limits; verified email; expiring hashed one-use reset/invitation tokens; parameterized SQL; strict DTO field allowlists; mandatory tenant membership; RLS; composite tenant FKs; optimistic concurrency; independent approval; sensitive contact masking for auditors; runtime audit/event mutation restrictions.

The rate limiter uses the actual API socket address, not an untrusted forwarded header. With Next's proxy, users share its upstream address and therefore share a conservative bucket (30 auth POSTs/15 minutes; 600 other calls/minute). This is appropriate for a small local evaluation, not high-volume deployment. Production needs a tested trusted-proxy chain, edge per-client limits and account-based failed-login controls. Do not blindly enable `trust proxy=true` or trust arbitrary X-Forwarded-For.

The local `.env` contains secrets and is excluded from source and archive. Run `npm run setup` to generate your own. Never commit `.env`, database dumps, uploaded records or test SMTP messages. Only localhost binds are exposed for PostgreSQL, Redis and Mailpit. Use secret storage, TLS, restrictive network rules and backup/key management before hosting.

An organization member's role is read on every request; scope is rechecked in its transaction. Audit tables are append-only for the runtime role, but a database owner can still rewrite them. This is not external tamper evidence. The audit captures changed field names, reason and versions rather than full sensitive before/after values; complete versioned employment history is deferred.

Current limitations: no MFA/SSO; no per-account brute-force lockout; no full user device inventory; no NID/bank/salary/document storage; no complete granular custom RBAC; no statutory compliance calculation; no automated retention/legal holds; no production recovery certification; no external security review. The startup production configuration check is not a security certification.

Do not use this release for live payroll or sensitive production HR deployment before the remaining controls and organizational review are completed. Report issues privately to the project maintainer without including real employee data.
