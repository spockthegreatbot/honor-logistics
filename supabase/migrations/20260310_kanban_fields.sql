-- Job board overhaul: soft-delete, runup checkbox, board column tracking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS runup_completed BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS board_column VARCHAR DEFAULT NULL;

-- Index for fast board queries
CREATE INDEX IF NOT EXISTS idx_jobs_archived ON jobs(archived);
CREATE INDEX IF NOT EXISTS idx_jobs_board_column ON jobs(board_column);
