import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

// Ensure data directories exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'assets'), { recursive: true });

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      background_pattern TEXT NOT NULL DEFAULT 'blank',
      background_color TEXT NOT NULL DEFAULT '#ffffff',
      revision INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS strokes (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      z_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pages_session ON pages(session_id);
    CREATE INDEX IF NOT EXISTS idx_strokes_page ON strokes(page_id);

    CREATE TABLE IF NOT EXISTS action_log (
      action_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      result TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Migration: add thumbnail column if missing
  const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  if (!cols.some(c => c.name === 'thumbnail')) {
    db.exec("ALTER TABLE sessions ADD COLUMN thumbnail TEXT DEFAULT NULL");
  }

  // Migration: add deleted_at column for soft delete
  if (!cols.some(c => c.name === 'deleted_at')) {
    db.exec("ALTER TABLE sessions ADD COLUMN deleted_at TEXT DEFAULT NULL");
  }

  // Migration: split revision into strokes_revision + background_revision
  const pagesCols = db.prepare("PRAGMA table_info(pages)").all() as { name: string }[];
  if (!pagesCols.some(c => c.name === 'strokes_revision')) {
    db.exec("ALTER TABLE pages ADD COLUMN strokes_revision INTEGER NOT NULL DEFAULT 0");
    // Seed from existing revision
    db.exec("UPDATE pages SET strokes_revision = revision");
  }
  if (!pagesCols.some(c => c.name === 'background_revision')) {
    db.exec("ALTER TABLE pages ADD COLUMN background_revision INTEGER NOT NULL DEFAULT 0");
  }

  // Migration: add snippets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS snippets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      strokes TEXT NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      thumbnail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export default getDb;
