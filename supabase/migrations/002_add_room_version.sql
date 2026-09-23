-- Migration: Add version column for optimistic locking
-- Date: 2024
-- Description: Adds a version column to enable optimistic locking on room updates

-- Add version column for optimistic locking
-- Each successful update increments this version
-- Concurrent updates with stale versions will fail (0 rows affected)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

-- Create index on version for potential query optimization
CREATE INDEX IF NOT EXISTS idx_rooms_version ON rooms(version);

-- Existing rows get version = 0 (consistent with DEFAULT)
-- No data migration needed; all existing rooms start at version 0

-- Comment for documentation
COMMENT ON COLUMN rooms.version IS 'Optimistic locking version - increments on each successful update';
