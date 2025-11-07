// D1数据库服务类
export class D1DatabaseService {
  // 检查是否为桌面端环境
  static isDesktop() {
    return window.electronConfig?.isDesktop || false;
  }

  // 初始化D1数据库连接
  static async getDB() {
    // 桌面端禁用D1连接
    if (this.isDesktop()) {
      throw new Error('桌面端版本已禁用云端数据库功能，请使用本地存储');
    }

    // 在Cloudflare Workers环境中，DB会自动绑定到全局变量
    if (typeof DB !== 'undefined') {
      return DB;
    }

  // 在本地开发环境中，如需显式启用模拟DB，请设置 VITE_ALLOW_D1_MOCK=true
  if (import.meta.env.DEV && import.meta.env.VITE_ALLOW_D1_MOCK === 'true') {
      return this.getMockDB();
    }

    throw new Error('D1数据库未正确绑定');
  }

  // 本地开发环境的模拟数据库
  static getMockDB() {
    return {
      prepare: (query) => ({
        bind: (...params) => ({
          all: async () => {
            console.log('Mock D1 Query:', query, params);
            return { results: [] };
          },
          first: async () => {
            console.log('Mock D1 Query (first):', query, params);
            return null;
          },
          run: async () => {
            console.log('Mock D1 Query (run):', query, params);
            return { success: true };
          }
        })
      }),
      batch: async (statements) => {
        console.log('Mock D1 Batch:', statements);
        return statements.map(() => ({ success: true }));
      }
    };
  }

  // 同步用户数据到D1
  static async syncUserData() {
    try {
      // 桌面端直接返回成功，不执行云端同步
      if (this.isDesktop()) {
        return { success: true, message: '桌面端版本使用本地存储，无需云端同步' };
      }

      const db = await this.getDB();
      
      // 获取本地数据
      const localData = {
        memos: JSON.parse(localStorage.getItem('memos') || '[]'),
        pinnedMemos: JSON.parse(localStorage.getItem('pinnedMemos') || '[]'),
        themeColor: localStorage.getItem('themeColor') || '#818CF8',
        darkMode: localStorage.getItem('darkMode') || 'false',
        hitokotoConfig: JSON.parse(localStorage.getItem('hitokotoConfig') || '{"enabled":true,"types":["a","b","c","d","i","j","k"]}'),
        fontConfig: JSON.parse(localStorage.getItem('fontConfig') || '{"selectedFont":"default"}'),
  backgroundConfig: JSON.parse(localStorage.getItem('backgroundConfig') || '{"imageUrl":"","brightness":50,"blur":10,"useRandom":false}'),
  avatarConfig: JSON.parse(localStorage.getItem('avatarConfig') || '{"imageUrl":""}'),
  canvasConfig: JSON.parse(localStorage.getItem('canvasState') || 'null'),
  musicConfig: JSON.parse(localStorage.getItem('musicConfig') || '{"enabled":true,"customSongs":[]}'),
  s3Config: JSON.parse(localStorage.getItem('s3Config') || '{"enabled":false,"endpoint":"","accessKeyId":"","secretAccessKey":"","bucket":"","region":"auto","publicUrl":"","provider":"r2"}')
      };

      // 同步memos
      for (const memo of localData.memos) {
        await this.upsertMemo(memo);
      }

      // 同步用户设置
      await this.upsertUserSettings({
        pinnedMemos: localData.pinnedMemos,
        themeColor: localData.themeColor,
        darkMode: localData.darkMode,
        hitokotoConfig: localData.hitokotoConfig,
        fontConfig: localData.fontConfig,
        backgroundConfig: localData.backgroundConfig,
        avatarConfig: localData.avatarConfig,
  canvasConfig: localData.canvasConfig,
  musicConfig: localData.musicConfig,
  s3Config: localData.s3Config
      });

      return { success: true, message: '数据同步到D1成功' };
    } catch (error) {
      console.error('D1数据同步失败:', error);
      return { success: false, message: error.message };
    }
  }

  // 从D1恢复用户数据
  static async restoreUserData() {
    try {
      // 桌面端直接返回成功，不执行云端恢复
      if (this.isDesktop()) {
        return { success: true, message: '桌面端版本使用本地存储，无需云端恢复' };
      }

      const db = await this.getDB();

      // 获取所有memos
      const { results: memos } = await db
        .prepare('SELECT * FROM memos ORDER BY created_at DESC')
        .all();

      // 获取用户设置
      const settings = await db
        .prepare('SELECT * FROM user_settings LIMIT 1')
        .first();

      // 恢复到本地存储
      if (memos && memos.length > 0) {
        const localMemos = memos.map(memo => ({
          id: memo.memo_id,
          content: memo.content,
          tags: JSON.parse(memo.tags || '[]'),
          backlinks: JSON.parse(memo.backlinks || '[]'),
          audioClips: JSON.parse(memo.audio_clips || '[]'),
          is_public: memo.is_public ? true : false, // 🔧 添加is_public字段映射
          timestamp: memo.created_at,
          lastModified: memo.updated_at,
          createdAt: memo.created_at,
          updatedAt: memo.updated_at
        }));
        localStorage.setItem('memos', JSON.stringify(localMemos));
      }

      if (settings) {
        if (settings.pinned_memos) {
          localStorage.setItem('pinnedMemos', settings.pinned_memos);
        }
        if (settings.theme_color) {
          localStorage.setItem('themeColor', settings.theme_color);
        }
        if (settings.dark_mode !== null) {
          localStorage.setItem('darkMode', settings.dark_mode.toString());
        }
        if (settings.hitokoto_config) {
          localStorage.setItem('hitokotoConfig', settings.hitokoto_config);
        }
        if (settings.font_config) {
          localStorage.setItem('fontConfig', settings.font_config);
        }
        if (settings.background_config) {
          localStorage.setItem('backgroundConfig', settings.background_config);
        }
        if (settings.avatar_config) {
          localStorage.setItem('avatarConfig', settings.avatar_config);
        }
        if (settings.canvas_config) {
          localStorage.setItem('canvasState', settings.canvas_config);
        }
        if (settings.music_config) {
          localStorage.setItem('musicConfig', settings.music_config);
        }
        if (settings.s3_config) {
          localStorage.setItem('s3Config', settings.s3_config);
        }
      }

      return { success: true, message: '从D1恢复数据成功，请刷新页面查看' };
    } catch (error) {
      console.error('从D1恢复数据失败:', error);
      return { success: false, message: error.message };
    }
  }

  // 插入或更新memo
  static async upsertMemo(memo) {
    const db = await this.getDB();
    
    // 确保时间戳不为空，使用当前时间作为备用
    const now = new Date().toISOString();
    const createdAt = memo.timestamp || now;
    const updatedAt = memo.lastModified || memo.timestamp || now;

    // 检查memo是否已存在
    const existingMemo = await db
      .prepare('SELECT * FROM memos WHERE memo_id = ?')
      .bind(memo.id)
      .first();

    if (existingMemo) {
      // 更新现有memo
      await db
        .prepare('UPDATE memos SET content = ?, tags = ?, backlinks = ?, audio_clips = ?, is_public = ?, updated_at = ? WHERE memo_id = ?')
        .bind(
          memo.content,
          JSON.stringify(memo.tags || []),
          JSON.stringify(Array.isArray(memo.backlinks) ? memo.backlinks : []),
          JSON.stringify(Array.isArray(memo.audioClips) ? memo.audioClips : []),
          memo.is_public ? 1 : 0, // 🔧 添加is_public字段
          updatedAt,
          memo.id
        )
        .run();
    } else {
      // 插入新memo
      await db
        .prepare('INSERT INTO memos (memo_id, content, tags, backlinks, audio_clips, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(
          memo.id,
          memo.content,
          JSON.stringify(memo.tags || []),
          JSON.stringify(Array.isArray(memo.backlinks) ? memo.backlinks : []),
          JSON.stringify(Array.isArray(memo.audioClips) ? memo.audioClips : []),
          memo.is_public ? 1 : 0, // 🔧 添加is_public字段
          createdAt,
          updatedAt
        )
        .run();
    }
  }

  // 插入或更新用户设置
  static async upsertUserSettings(settings) {
    const db = await this.getDB();
    
    // 检查用户设置是否已存在
    const existingSettings = await db
      .prepare('SELECT * FROM user_settings LIMIT 1')
      .first();

    if (existingSettings) {
      // 更新现有设置
      await db
        .prepare('UPDATE user_settings SET pinned_memos = ?, theme_color = ?, dark_mode = ?, hitokoto_config = ?, font_config = ?, background_config = ?, avatar_config = ?, canvas_config = ?, music_config = ?, s3_config = ?, updated_at = ?')
        .bind(
          JSON.stringify(settings.pinnedMemos),
          settings.themeColor,
          settings.darkMode === 'true',
          JSON.stringify(settings.hitokotoConfig),
          JSON.stringify(settings.fontConfig),
          JSON.stringify(settings.backgroundConfig),
          JSON.stringify(settings.avatarConfig || { imageUrl: '' }),
          settings.canvasConfig ? JSON.stringify(settings.canvasConfig) : null,
          JSON.stringify(settings.musicConfig || { enabled: true, customSongs: [] }),
          JSON.stringify(settings.s3Config || { enabled: false, endpoint: '', accessKeyId: '', secretAccessKey: '', bucket: '', region: 'auto', publicUrl: '', provider: 'r2' }),
          new Date().toISOString()
        )
        .run();
    } else {
      // 插入新设置
      await db
        .prepare('INSERT INTO user_settings (pinned_memos, theme_color, dark_mode, hitokoto_config, font_config, background_config, avatar_config, canvas_config, music_config, s3_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(
          JSON.stringify(settings.pinnedMemos),
          settings.themeColor,
          settings.darkMode === 'true',
          JSON.stringify(settings.hitokotoConfig),
          JSON.stringify(settings.fontConfig),
          JSON.stringify(settings.backgroundConfig),
          JSON.stringify(settings.avatarConfig || { imageUrl: '' }),
          settings.canvasConfig ? JSON.stringify(settings.canvasConfig) : null,
          JSON.stringify(settings.musicConfig || { enabled: true, customSongs: [] }),
          JSON.stringify(settings.s3Config || { enabled: false, endpoint: '', accessKeyId: '', secretAccessKey: '', bucket: '', region: 'auto', publicUrl: '', provider: 'r2' }),
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();
    }
  }

  // 删除memo
  static async deleteMemo(memoId) {
    const db = await this.getDB();
    
    await db
      .prepare('DELETE FROM memos WHERE memo_id = ?')
      .bind(memoId)
      .run();
  }

  // 获取公开memo（游客模式使用）
  static async getPublicMemos() {
    const db = await this.getDB();

    const { results } = await db
      .prepare('SELECT * FROM memos WHERE is_public = 1 ORDER BY created_at DESC')
      .all();

    return results || [];
  }

  // 获取所有memos
  static async getAllMemos() {
    const db = await this.getDB();
    
    const { results } = await db
      .prepare('SELECT * FROM memos ORDER BY created_at DESC')
      .all();
    
    return results;
  }

  // 获取用户设置
  static async getUserSettings() {
    const db = await this.getDB();
    
    const settings = await db
      .prepare('SELECT * FROM user_settings LIMIT 1')
      .first();
    
    return settings;
  }

  // 初始化数据库表
  static async initDatabase() {
    try {
      const db = await this.getDB();
      
      // 创建memos表
      await db.prepare(`
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
        )
      `).run();

      // 创建user_settings表
    await db.prepare(`
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
        )
      `).run();

      // 创建索引
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_memos_created_at ON memos(created_at)').run();

      return { success: true, message: 'D1数据库初始化成功' };
    } catch (error) {
      console.error('D1数据库初始化失败:', error);
      return { success: false, message: error.message };
    }
  }
}
