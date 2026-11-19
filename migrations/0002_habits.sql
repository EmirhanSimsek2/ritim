CREATE TABLE tracker_habit_days(day TEXT PRIMARY KEY,payload TEXT NOT NULL);
ALTER TABLE import_jobs ADD COLUMN habit_days_count INTEGER NOT NULL DEFAULT 0;
CREATE TABLE import_habit_days(job TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,day TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(job,day));
