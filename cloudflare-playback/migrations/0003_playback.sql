CREATE TABLE IF NOT EXISTS playback_account (id INTEGER PRIMARY KEY CHECK(id=1), credentials TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS playback_activation (session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, credentials TEXT NOT NULL, expires INTEGER NOT NULL, next_poll INTEGER NOT NULL, interval_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS playback_jobs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, video_id TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS playback_jobs_session ON playback_jobs(session_id, created);
