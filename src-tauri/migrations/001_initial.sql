CREATE TABLE IF NOT EXISTS library (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cover_url TEXT,
  status TEXT DEFAULT 'reading',
  content_rating TEXT DEFAULT 'safe',
  tags TEXT DEFAULT '[]',
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_progress (
  manga_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  page INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (manga_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS downloads (
  chapter_id TEXT PRIMARY KEY,
  manga_id TEXT NOT NULL,
  manga_title TEXT,
  chapter_title TEXT,
  volume TEXT,
  chapter_num TEXT,
  status TEXT DEFAULT 'pending',
  path TEXT,
  total_pages INTEGER DEFAULT 0,
  downloaded_pages INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reading_progress_manga ON reading_progress(manga_id);
CREATE INDEX IF NOT EXISTS idx_downloads_manga ON downloads(manga_id);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
