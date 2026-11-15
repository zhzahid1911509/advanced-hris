# Advanced HRIS · v0.5.0

A working foundation release for the Bangladesh-focused Advanced HRIS project. Next.js web app, NestJS API, PostgreSQL/Prisma and Redis/BullMQ worker. Source code, migrations, tests and documentation are included. There are no default accounts or mock production records.

This release adds [custom directory roles](docs/CUSTOM-DIRECTORY-ROLES.md) and includes [direct-report teams](docs/DIRECT-REPORTS.md) and includes [scoped employee directory access](docs/SCOPED-DIRECTORY.md) and includes [account security](docs/ACCOUNT-SECURITY.md) to the [v0.1 foundation](docs/FEATURE-IMPLEMENTATION.md). See the [remaining implementation plan](docs/NEXT-IMPLEMENTATION.md).

## Quick start — Windows, macOS and Linux

Install Node.js 22 LTS (npm included) and Docker Desktop with Linux containers / Docker Engine with Compose v2. Run Docker before continuing. Open a terminal in the extracted `advanced-hris` folder.

```sh
npm ci
npm run setup
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:check
npm run dev
```

If PostgreSQL is still starting, check `docker compose ps`; wait for `healthy` and retry `npm run db:migrate`.

Open:

- Application: http://localhost:3000
- Local email inbox: http://localhost:8025
- API health: http://localhost:4000/api/v1/health
- API explorer: http://localhost:4000/api/docs

Create a workspace in the application. Open its verification email in Mailpit, follow the link and press **Verify email**. Sign in. Add branches/departments, then employees. After enabling an authenticator in Account security, an administrator can invite an employee from their profile. Use a different browser/private window to accept the invitation and try employee self-service.

Mailpit is a local email catcher; it does not send email to real inboxes. The worker must be running for verification and invitations to arrive. `npm run dev` starts the web app, API and worker together; Ctrl+C stops all three.

## Build and run compiled code

With local infrastructure running and migrations applied:

```sh
npm run build
npm run typecheck
npm test
```

Then open three terminals in the project folder:

```sh
npm run start -w @hris/api
```

```sh
npm run start -w @hris/worker
```

```sh
npm run start -w @hris/web
```

Do not leave `npm run dev` running on the same ports. The API defaults to local HTTP when `NODE_ENV` is unset; production requires HTTPS and secure cookies. Next runs its compiled production build with `next start`.

An all-container local build is also supplied:

```sh
npm run setup
docker compose -f compose.yaml -f compose.app.yaml up --build -d
```

This alternative uses the same `.env` and database volume. Do not run host API/web/worker instances at the same time. See [RUN-AND-BUILD.md](docs/RUN-AND-BUILD.md) for details, complete Windows steps, testing, troubleshooting and deployment boundaries.

## Included documentation

- [Feature implementation and scope](docs/FEATURE-IMPLEMENTATION.md)
- [Complete run, build and troubleshooting steps](docs/RUN-AND-BUILD.md)
- [Developer guide and code map](docs/DEVELOPER-GUIDE.md)
- [API contracts and examples](docs/API.md)
- [Security model and limitations](docs/SECURITY.md)
- [Test evidence](docs/TEST-REPORT.md)
- [Release notes](CHANGELOG.md)
- [GitHub commit message](COMMIT_MESSAGE.txt)
- [Next implementation backlog](docs/NEXT-IMPLEMENTATION.md)

Future deliveries should include the complete updated project, feature status documentation, a commit message, and run/build instructions. This convention is recorded in [DELIVERY-CONVENTION.md](docs/DELIVERY-CONVENTION.md).
