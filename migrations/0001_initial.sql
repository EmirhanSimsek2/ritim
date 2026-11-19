CREATE TABLE tracker_meta (
  id TEXT PRIMARY KEY CHECK(id='owner'),
  revision INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL,
  last_mutation TEXT NOT NULL DEFAULT ''
);
CREATE TABLE tracker_entries (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE tracker_days (day TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX attempts_expiry ON login_attempts(expires_at);
CREATE TABLE import_jobs(id TEXT PRIMARY KEY,base_revision INTEGER NOT NULL,config TEXT NOT NULL,entries_count INTEGER NOT NULL,days_count INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE import_entries(job TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(job,id));
CREATE TABLE import_days(job TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,day TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(job,day));
