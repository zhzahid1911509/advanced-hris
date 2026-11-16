# v0.8.0 — Profile and document experience

Added password visibility, private PDF previews and account/workspace thumbnails. Reduced redundant requests and added document processing feedback.

# v0.7.0 — Private employee documents

Added PDF uploads with private quarantine, ClamAV decisions, S3-compatible storage, version history and authorized attachment downloads.

# v0.6.0 — Temporary directory delegation

Added auditable, revocable professional-profile sharing with per-read grantor scope checks and expiry. See [implementation notes](docs/DIRECTORY-DELEGATION.md).

# v0.5.0 — Custom directory roles

Added workspace-defined directory scopes and phone visibility, role lifecycle controls, invitations and member assignments. See [the feature guide](docs/CUSTOM-DIRECTORY-ROLES.md).

# v0.4.0 — Direct-report teams

Added audited reporting-line assignments, cycle prevention, team manager invitations and scoped employee visibility. See [implementation and upgrade](docs/DIRECT-REPORTS.md).

# v0.3.0 — Scoped employee directory

Added branch and department manager roles, scoped directory and dashboard queries, MFA-protected private phone access policies and audit events. Includes the v0.2 migration and worker hotfixes.

# v0.2.0 — Account security

Added authenticator enrollment, recovery codes, account attempt limits, session management, MFA for invitation and membership changes, and runtime database diagnostics. See [implementation notes](docs/ACCOUNT-SECURITY.md).

# Changelog

## 0.1.0 — 2026-11-12

Initial working foundation and basic Core HR release. Includes verified organization registration, session authentication/recovery, multi-tenancy/RLS, four scoped role templates, employee records, organization units, invitations, access management, independent contact-change approvals, audit/timeline, durable notification/email jobs and responsive workspace UI.

Includes full source, SQL migrations, lockfile, CI, local Compose services, optional application image, feature documentation and run/build instructions. No production data, default credentials, external deployment or live payment integration.

See docs/FEATURE-IMPLEMENTATION.md for the exact scope and deferred roadmap items.
