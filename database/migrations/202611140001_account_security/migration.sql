ALTER TABLE users
  ADD COLUMN "mfaSecret" TEXT,
  ADD COLUMN "pendingSecret" TEXT,
  ADD COLUMN "pendingUntil" TIMESTAMP(3),
  ADD COLUMN "lastTotpStep" INTEGER,
  ADD COLUMN "recoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE sessions
  ADD COLUMN handle UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN agent TEXT NOT NULL DEFAULT '',
  ADD COLUMN "factorAt" TIMESTAMP(3);
CREATE UNIQUE INDEX sessions_handle_key ON sessions(handle);
