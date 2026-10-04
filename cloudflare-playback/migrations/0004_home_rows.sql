ALTER TABLE videos ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX videos_views ON videos(view_count DESC);
