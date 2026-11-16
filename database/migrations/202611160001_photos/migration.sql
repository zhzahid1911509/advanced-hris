BEGIN;
ALTER TABLE tenants ADD COLUMN photo text;
ALTER TABLE users ADD COLUMN photo text;
COMMIT;
