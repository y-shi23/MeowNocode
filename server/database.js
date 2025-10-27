import Database from 'better-sqlite3';

let dbInstance = null;

export const connectDatabase = (filePath) => {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = new Database(filePath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  return dbInstance;
};

export const getDatabase = () => {
  if (!dbInstance) {
    throw new Error('Database has not been initialised');
  }
  return dbInstance;
};

export const migrateDatabase = () => {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memo_id TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      backlinks TEXT DEFAULT '[]',
      audio_clips TEXT DEFAULT '[]',
      is_public INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pinned_memos TEXT DEFAULT '[]',
      theme_color TEXT DEFAULT '#818CF8',
      dark_mode INTEGER DEFAULT 0,
      hitokoto_config TEXT DEFAULT '{"enabled":true,"types":["a","b","c","d","i","j","k"]}',
      font_config TEXT DEFAULT '{"selectedFont":"default"}',
  background_config TEXT DEFAULT '{"imageUrl":"","brightness":50,"blur":10,"useRandom":false}',
      avatar_config TEXT DEFAULT '{"imageUrl":""}',
      canvas_config TEXT DEFAULT NULL,
      music_config TEXT DEFAULT '{"enabled":true,"customSongs":[]}',
      s3_config TEXT DEFAULT '{"enabled":false,"endpoint":"","accessKeyId":"","secretAccessKey":"","bucket":"","region":"auto","publicUrl":"","provider":"r2"}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_memos_created_at ON memos(created_at);');
};

export const closeDatabase = () => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
};
