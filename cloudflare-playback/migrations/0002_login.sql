CREATE TABLE sessions (id TEXT PRIMARY KEY NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX sessions_expires ON sessions(expires);
CREATE TABLE login_attempts (id TEXT PRIMARY KEY NOT NULL, window INTEGER NOT NULL, attempts INTEGER NOT NULL);
