ALTER TABLE planning_proposals ADD COLUMN execution_status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE planning_proposals ADD COLUMN execution_detail TEXT;
