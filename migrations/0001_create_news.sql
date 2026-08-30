CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  menu_name TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  sales_time TEXT NOT NULL DEFAULT '',
  body_ja TEXT NOT NULL,
  body_en TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS news_published_date_id_idx
  ON news (published, date DESC, id DESC);
