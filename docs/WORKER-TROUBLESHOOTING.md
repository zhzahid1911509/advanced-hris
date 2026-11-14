# Diagnose delivery worker errors on Windows

Stop npm run dev before applying the patch to the project root. The included migration runner also contains the existing managed PostgreSQL role fix. The worker now records the dispatch operation and short driver codes, including nested network errors. No change to application tables is needed for logging.

When running npm run dev on Windows with the supplied local Redis service, start Docker Desktop, run docker compose up -d redis, and run docker compose exec redis redis-cli ping. Expect PONG. Set REDIS_URL=redis://127.0.0.1:6379 in the root .env. For hosted Redis retain its provider URL instead. The all-container deployment uses redis as the hostname. For local email testing also start Mailpit with docker compose up -d mailpit.

Run npm run db:migrate using the schema owner, then npm run db:check using the restricted runtime URL. They should target the same database and schema. Run npm run dev again. The database check is a first check only and does not exercise every worker query. If dispatch_failed persists, use the stage and codes to identify the failing operation. For example, P2021 indicates a missing table, P2022 a missing column, and P2024 a database connection pool timeout. For queue network errors, ECONNREFUSED means the configured endpoint refused the connection. For a supervised production build run npm run build and restart the compiled worker.

Commit message: fix(worker): log dispatch stages and nested database and queue error codes
