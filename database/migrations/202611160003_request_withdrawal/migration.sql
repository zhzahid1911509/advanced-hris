BEGIN;
ALTER TABLE profile_requests DROP CONSTRAINT request_state_check;
ALTER TABLE profile_requests ADD CONSTRAINT request_state_check CHECK(state IN ('PENDING','APPROVED','REJECTED','WITHDRAWN'));
ALTER TABLE profile_workflows DROP CONSTRAINT profile_workflows_mode_check;
ALTER TABLE profile_workflows ADD CONSTRAINT profile_workflows_mode_check CHECK(mode IN ('EITHER','HR_THEN_ADMIN','BOTH','EMERGENCY_CHANGE'));
COMMIT;
