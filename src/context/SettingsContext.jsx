import React, { createContext, useContext, useState, useEffect } from 'react';
import { getDeletedMemoTombstones, setDeletedMemoTombstones } from '@/lib/utils';
import largeFileStorage from '@/lib/largeFileStorage';
import s3StorageService from '@/lib/s3Storage';
import { toast } from 'sonner';

const SettingsContext = createContext();

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }) {
  const [hitokotoConfig, setHitokotoConfig] = useState({
    enabled: true,
    types: ['a', 'b', 'c', 'd', 'i', 'j', 'k'] // 默认全部类型
  });
  const [fontConfig, setFontConfig] = useState({
    selectedFont: 'default', // default, jinghua, lxgw, kongshan
    fontSize: 16 // px, default 16
  });
  const [backgroundConfig, setBackgroundConfig] = useState({
    imageUrl: '',
    brightness: 50, // 0-100
  blur: 10, // 0-50 模糊强度
  useRandom: false // 是否使用随机背景
  });
  const [avatarConfig, setAvatarConfig] = useState({
    imageUrl: '' // 用户自定义头像URL
  });
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [aiConfig, setAiConfig] = useState({
    baseUrl: '',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    enabled: false
  });

  // 音乐功能配置（启用即从 localStorage 读取，避免初始空列表导致恢复失败）
  const [musicConfig, setMusicConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('musicConfig');
      return saved ? JSON.parse(saved) : { enabled: true, customSongs: [] };
    } catch {
      return { enabled: true, customSongs: [] };
    }
  });

  // S3 存储配置
  const [s3Config, setS3Config] = useState({
    enabled: false,
    endpoint: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucket: '',
    region: 'auto',
    publicUrl: '',
    provider: 'r2' // r2, s3, minio
  });

  const [keyboardShortcuts, setKeyboardShortcuts] = useState({
    toggleSidebar: 'Tab',
    openAIDialog: 'Ctrl+Space',
    openSettings: 'Ctrl+,',
  toggleCanvasMode: 'Ctrl+/',
  openDailyReview: 'Ctrl+\\'
  });

  const S3_SYNC_OBJECT_KEY = 'meow-app/app-data.json';

  const ensureS3Client = React.useCallback(() => {
    if (!s3Config?.enabled) return null;
    try {
      const normalizedConfig = {
        endpoint: s3Config.endpoint,
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
        bucket: s3Config.bucket,
        region: s3Config.region || 'auto',
        publicUrl: s3Config.publicUrl || s3Config.endpoint,
        provider: s3Config.provider || 'r2'
      };

      const needsInit = !s3StorageService.initialized
        || ['endpoint', 'accessKeyId', 'secretAccessKey', 'bucket', 'region', 'publicUrl', 'provider']
          .some((key) => s3StorageService.config?.[key] !== normalizedConfig[key]);

      if (needsInit) {
        s3StorageService.init(s3Config);
      }

      if (!s3StorageService.isConfigured()) {
        return null;
      }
      return s3StorageService;
    } catch (error) {
      console.warn('S3服务不可用:', error);
      return null;
    }
  }, [s3Config]);

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  };

  const collectLocalSettings = React.useCallback(() => ({
    themeColor: localStorage.getItem('themeColor') || '#818CF8',
    darkMode: localStorage.getItem('darkMode') || 'false',
    hitokotoConfig: readJson('hitokotoConfig', hitokotoConfig),
    fontConfig: readJson('fontConfig', fontConfig),
    backgroundConfig: readJson('backgroundConfig', backgroundConfig),
    avatarConfig: readJson('avatarConfig', avatarConfig),
    canvasConfig: readJson('canvasState', null),
    musicConfig: readJson('musicConfig', musicConfig),
    keyboardShortcuts: readJson('keyboardShortcuts', keyboardShortcuts),
  }), [backgroundConfig, avatarConfig, fontConfig, hitokotoConfig, musicConfig, keyboardShortcuts]);

  // ---- Auto sync scheduler (debounced) ----
  const syncTimerRef = React.useRef(null);
  const syncingRef = React.useRef(false);
  const pendingRef = React.useRef(false);
  const lastSyncAtRef = React.useRef(0);

  const dispatchDataChanged = (detail = {}) => {
    try {
      window.dispatchEvent(new CustomEvent('app:dataChanged', { detail }));
    } catch {}
  };

  const toTimestamp = (value) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  };

  const doSync = React.useCallback(async () => {
    if (!cloudSyncEnabled || !s3Config?.enabled) return;

    const s3Service = ensureS3Client();
    if (!s3Service) return;

    if (syncingRef.current) { pendingRef.current = true; return; }

    const now = Date.now();
    const minInterval = 5000;
    if (now - lastSyncAtRef.current < minInterval) {
      if (!pendingRef.current) {
        pendingRef.current = true;
        setTimeout(() => {
          if (pendingRef.current) {
            pendingRef.current = false;
            doSync();
          }
        }, minInterval - (now - lastSyncAtRef.current));
      }
      return;
    }

    syncingRef.current = true;
    lastSyncAtRef.current = now;

    try {
      const localMemos = readJson('memos', []);
      const localPinned = readJson('pinnedMemos', []);
      const localSettings = collectLocalSettings();
      const localTombstones = getDeletedMemoTombstones();

      let remoteData = null;
      try {
        remoteData = await s3Service.downloadJson(S3_SYNC_OBJECT_KEY);
      } catch (error) {
        console.warn('从S3获取数据失败:', error);
      }

      const remoteMemos = Array.isArray(remoteData?.memos) ? remoteData.memos : [];
      const remotePinned = Array.isArray(remoteData?.pinnedMemos) ? remoteData.pinnedMemos : [];
      const remoteTombstones = Array.isArray(remoteData?.deletedMemoIds) ? remoteData.deletedMemoIds : [];

      const tombstoneMap = new Map();
      const mergeTombstones = (list) => {
        for (const item of list || []) {
          if (!item || item.id == null) continue;
          const id = String(item.id);
          const existing = tombstoneMap.get(id);
          const candidateTime = toTimestamp(item.deletedAt);
          const existingTime = existing ? toTimestamp(existing.deletedAt) : 0;
          if (!existing || candidateTime > existingTime) {
            tombstoneMap.set(id, {
              id,
              deletedAt: item.deletedAt || new Date().toISOString()
            });
          }
        }
      };
      mergeTombstones(remoteTombstones);
      mergeTombstones(localTombstones);

      const deletedSet = new Set([...tombstoneMap.keys()]);
      const records = new Map();

      const ingest = (memo, pinned, source) => {
        if (!memo || memo.id == null) return;
        const id = String(memo.id);
        if (deletedSet.has(id)) return;
        const updatedAt = toTimestamp(memo.updatedAt || memo.lastModified || memo.timestamp || memo.createdAt);
        const record = records.get(id);
        const candidate = {
          data: { ...memo },
          pinned: pinned || !!memo.isPinned,
          pinnedAt: pinned ? toTimestamp(memo.pinnedAt || memo.updatedAt || memo.createdAt) : 0,
          updatedAt,
          source,
        };
        if (!record || candidate.updatedAt > record.updatedAt || (candidate.updatedAt === record.updatedAt && source === 'local')) {
          records.set(id, candidate);
        } else if (candidate.updatedAt === record.updatedAt) {
          if (!record.pinned && candidate.pinned) {
            records.set(id, { ...record, pinned: true, pinnedAt: Math.max(record.pinnedAt, candidate.pinnedAt) });
          }
        }
      };

      localMemos.forEach((memo) => ingest(memo, false, 'local'));
      localPinned.forEach((memo) => ingest(memo, true, 'local'));
      remoteMemos.forEach((memo) => ingest(memo, false, 'remote'));
      remotePinned.forEach((memo) => ingest(memo, true, 'remote'));

      deletedSet.forEach((id) => records.delete(id));

      const finalMemos = [];
      const finalPinned = [];

      records.forEach((record) => {
        const memo = { ...record.data };
        if (record.pinned) {
          memo.isPinned = true;
          const pinnedAtMs = record.pinnedAt || toTimestamp(memo.pinnedAt) || record.updatedAt;
          memo.pinnedAt = pinnedAtMs ? new Date(pinnedAtMs).toISOString() : new Date().toISOString();
          finalPinned.push(memo);
        } else {
          if (memo.isPinned) delete memo.isPinned;
          if (memo.pinnedAt) delete memo.pinnedAt;
          finalMemos.push(memo);
        }
      });

      const sortBy = (arr, getter) => arr.sort((a, b) => getter(b) - getter(a));
      sortBy(finalMemos, (memo) => toTimestamp(memo.createdAt || memo.timestamp || memo.updatedAt));
      sortBy(finalPinned, (memo) => toTimestamp(memo.pinnedAt || memo.updatedAt || memo.createdAt));

      const memosChanged = JSON.stringify(finalMemos) !== JSON.stringify(localMemos);
      const pinnedChanged = JSON.stringify(finalPinned) !== JSON.stringify(localPinned);

      if (memosChanged) {
        localStorage.setItem('memos', JSON.stringify(finalMemos));
        dispatchDataChanged({ part: 'sync.memos' });
      }

      if (pinnedChanged) {
        localStorage.setItem('pinnedMemos', JSON.stringify(finalPinned));
        dispatchDataChanged({ part: 'sync.pinned' });
      }

      const tombstoneList = Array.from(tombstoneMap.values());
      setDeletedMemoTombstones(tombstoneList);

      const payload = {
        version: 's3-sync-v1',
        updatedAt: new Date().toISOString(),
        memos: finalMemos,
        pinnedMemos: finalPinned,
        settings: localSettings,
        deletedMemoIds: tombstoneList
      };

      await s3Service.uploadJson(S3_SYNC_OBJECT_KEY, payload);

      lastSyncAtRef.current = Date.now();
      localStorage.setItem('lastCloudSyncAt', String(lastSyncAtRef.current));
    } catch (error) {
      console.error('S3同步失败:', error);
      throw error;
    } finally {
      syncingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(doSync, 500);
      }
    }
  }, [cloudSyncEnabled, s3Config, ensureS3Client, collectLocalSettings]);
  const scheduleSync = React.useCallback((reason = 'change') => {
    if (!cloudSyncEnabled) return;
    // minimal interval 1500ms
    const now = Date.now();
    const since = now - lastSyncAtRef.current;
    // debounce immediate timer
    clearTimeout(syncTimerRef.current);
    const delay = since < 1500 ? 800 : 200; // small delay when not recently synced
    syncTimerRef.current = setTimeout(doSync, delay);
  }, [cloudSyncEnabled, doSync]);

  useEffect(() => {
  // 从 localStorage 加载一言设置
    const savedHitokotoConfig = localStorage.getItem('hitokotoConfig');
    if (savedHitokotoConfig) {
      try {
        setHitokotoConfig(JSON.parse(savedHitokotoConfig));
      } catch (error) {
        console.warn('Failed to parse Hitokoto config:', error);
      }
    }

  // 从 localStorage 加载字体设置
    const savedFontConfig = localStorage.getItem('fontConfig');
    if (savedFontConfig) {
      try {
        const parsed = JSON.parse(savedFontConfig);
        setFontConfig({ selectedFont: 'default', fontSize: 16, ...parsed });
      } catch (error) {
        console.warn('Failed to parse Font config:', error);
      }
    }

  // 从 localStorage 加载背景设置
  const savedBackgroundConfig = localStorage.getItem('backgroundConfig');
    if (savedBackgroundConfig) {
      try {
    const parsed = JSON.parse(savedBackgroundConfig);
  // 兼容旧版本缺少 useRandom/blur/brightness/imageUrl 字段
    setBackgroundConfig({ imageUrl: '', brightness: 50, blur: 10, useRandom: false, ...parsed });
      } catch (error) {
        console.warn('Failed to parse Background config:', error);
      }
    }

  // 从 localStorage 加载头像设置
    const savedAvatarConfig = localStorage.getItem('avatarConfig');
    if (savedAvatarConfig) {
      try {
        setAvatarConfig(JSON.parse(savedAvatarConfig));
      } catch (error) {
        console.warn('Failed to parse Avatar config:', error);
      }
    }

  // 从 localStorage 加载云同步设置
    const savedCloudSyncEnabled = localStorage.getItem('cloudSyncEnabled');
    if (savedCloudSyncEnabled) {
      try {
        setCloudSyncEnabled(JSON.parse(savedCloudSyncEnabled));
      } catch (error) {
        console.warn('Failed to parse cloud sync config:', error);
      }
    }

  }, []);

  // 从 localStorage 加载 S3 配置
  useEffect(() => {
    try {
      const savedS3Config = localStorage.getItem('s3Config');
      if (savedS3Config) {
        const parsedConfig = JSON.parse(savedS3Config);
        setS3Config(parsedConfig);
  // 若配置已启用，则初始化 S3 客户端
        try {
          if (parsedConfig && parsedConfig.enabled) {
            s3StorageService.init(parsedConfig);
          }
        } catch (e) {
          console.warn('Init S3 on load failed:', e);
        }
      }
    } catch (error) {
      console.warn('Failed to parse S3 config:', error);
    }
  }, []);

  // 自动根据 S3 配置状态同步云同步开关
  useEffect(() => {
    const shouldEnable = Boolean(s3Config?.enabled);
    setCloudSyncEnabled(prev => (prev === shouldEnable ? prev : shouldEnable));
  }, [s3Config?.enabled]);

  // 从 localStorage 加载 AI 配置
  useEffect(() => {
    const savedAiConfig = localStorage.getItem('aiConfig');
    if (savedAiConfig) {
      try {
        setAiConfig(JSON.parse(savedAiConfig));
      } catch (error) {
        console.warn('Failed to parse AI config:', error);
      }
    }
  }, []);

  // 音乐配置已在初始化时读取，这里不再重复，避免覆盖编辑中的状态

  // 从 localStorage 加载快捷键配置
  useEffect(() => {
    const savedKeyboardShortcuts = localStorage.getItem('keyboardShortcuts');
    if (savedKeyboardShortcuts) {
      try {
        setKeyboardShortcuts(JSON.parse(savedKeyboardShortcuts));
      } catch (error) {
        console.warn('Failed to parse keyboard shortcuts config:', error);
      }
    }
  }, []);



  useEffect(() => {
  // 保存一言设置
    localStorage.setItem('hitokotoConfig', JSON.stringify(hitokotoConfig));
  dispatchDataChanged({ part: 'hitokoto' });
  }, [hitokotoConfig]);

  useEffect(() => {
  // 保存字体设置
    localStorage.setItem('fontConfig', JSON.stringify(fontConfig));
  dispatchDataChanged({ part: 'font' });
  }, [fontConfig]);

  useEffect(() => {
  // 保存背景设置（避免直接写入过大的 data URL）
    const persist = async () => {
      try {
        const cfg = backgroundConfig || {};
        const isDataUrl = typeof cfg.imageUrl === 'string' && cfg.imageUrl.startsWith('data:');
        const MAX_INLINE = 100_000; // ~100KB
        const tooLarge = isDataUrl && cfg.imageUrl.length > MAX_INLINE;

        let toSave = { ...cfg };

        if (tooLarge) {
          // 若体积超限，先把 dataURL 存到 IndexedDB
          if (!toSave.imageRef || !toSave.imageRef.id) {
            try {
              const match = /^data:(.*?);base64,(.*)$/.exec(cfg.imageUrl || '');
              const mime = match ? (match[1] || 'image/png') : 'image/png';
              const base64Part = match ? match[2] : '';
              const approxSize = Math.floor(((cfg.imageUrl.length - (cfg.imageUrl.indexOf(',') + 1)) * 3) / 4);
              const stored = await largeFileStorage.storeFile({
                name: 'background-image',
                size: approxSize,
                type: mime,
                data: `data:${mime};base64,${base64Part}`,
              });
              toSave.imageRef = { id: stored.id, type: mime, storedAt: new Date().toISOString() };
            } catch (e) {
              console.warn('Store background image to IndexedDB failed:', e);
            }
          }
          // 避免写入超大字符串
          toSave.imageUrl = '';
        }

        try {
          localStorage.setItem('backgroundConfig', JSON.stringify(toSave));
        } catch (err) {
          if (err && String(err.name || err).includes('QuotaExceededError')) {
            try {
              const minimal = { ...toSave, imageUrl: '' };
              localStorage.setItem('backgroundConfig', JSON.stringify(minimal));
              toast.error('本地存储空间不足，已停止缓存大图，建议使用外链或随机背景');
            } catch {}
          } else {
            throw err;
          }
        }
      } finally {
        dispatchDataChanged({ part: 'background' });
      }
    };
    try { persist(); } catch {}
  }, [backgroundConfig]);

  // 若存在 IndexedDB 引用且 imageUrl 为空，尝试在内存中恢复图片（不回写 localStorage）
  useEffect(() => {
    const recover = async () => {
      try {
        const ref = backgroundConfig?.imageRef;
        if (!ref || backgroundConfig?.imageUrl) return;
        const file = await largeFileStorage.getFile(ref.id);
        if (file && file.data) {
          setBackgroundConfig(prev => ({ ...prev, imageUrl: file.data }));
        }
      } catch (e) {
        console.warn('Recover background image failed:', e);
      }
    };
    try { recover(); } catch {}
  }, [backgroundConfig?.imageRef, backgroundConfig?.imageUrl]);

  useEffect(() => {
  // 保存头像设置
    localStorage.setItem('avatarConfig', JSON.stringify(avatarConfig));
  dispatchDataChanged({ part: 'avatar' });
  }, [avatarConfig]);

  useEffect(() => {
  // 保存云同步设置
    localStorage.setItem('cloudSyncEnabled', JSON.stringify(cloudSyncEnabled));
  }, [cloudSyncEnabled]);

  useEffect(() => {
  // 保存 AI 配置
    localStorage.setItem('aiConfig', JSON.stringify(aiConfig));
  dispatchDataChanged({ part: 'ai' });
  }, [aiConfig]);

  useEffect(() => {
  // 保存快捷键配置
    localStorage.setItem('keyboardShortcuts', JSON.stringify(keyboardShortcuts));
  }, [keyboardShortcuts]);

  // 保存音乐配置
  useEffect(() => {
    localStorage.setItem('musicConfig', JSON.stringify(musicConfig));
    dispatchDataChanged({ part: 'music' });
  }, [musicConfig]);

  // 保存 S3 配置
  useEffect(() => {
    localStorage.setItem('s3Config', JSON.stringify(s3Config));
    dispatchDataChanged({ part: 's3' });
  // 若已启用则保证运行时已初始化
    try {
      if (s3Config && s3Config.enabled) {
        s3StorageService.init(s3Config);
      }
    } catch (e) {
  // 仅写日志，不打断设置保存
      console.warn('Init S3 on change failed:', e);
    }
  }, [s3Config]);

  // Subscribe to app-level data change events and page lifecycle to auto sync
  useEffect(() => {
    if (!cloudSyncEnabled || !s3Config?.enabled) return;
    const onChange = () => scheduleSync('event');
    const onVisibility = () => {
      // Avoid heavy sync while tab is hiding; will sync on next activity
    };
    const onBeforeUnload = () => {
      // No-op: rely on next launch to perform safe sync
    };
    window.addEventListener('app:dataChanged', onChange);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onBeforeUnload);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('app:dataChanged', onChange);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onBeforeUnload);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [cloudSyncEnabled, s3Config, scheduleSync, doSync]);

  // Try restore on startup when local is empty (for both authenticated and guest users)
  useEffect(() => {
    const maybeRestore = async () => {
      try {
        const memos = readJson('memos', []);
        const pinned = readJson('pinnedMemos', []);
        const hasLocal = (Array.isArray(memos) && memos.length > 0) || (Array.isArray(pinned) && pinned.length > 0);

        if (hasLocal) {
          if (cloudSyncEnabled && s3Config?.enabled) {
            scheduleSync('startup-merge');
          }
          return;
        }

        if (!s3Config?.enabled) {
          return;
        }

        const s3Service = ensureS3Client();
        if (!s3Service) return;

        try {
          const remoteData = await s3Service.downloadJson(S3_SYNC_OBJECT_KEY);
          if (!remoteData) return;

          if (Array.isArray(remoteData.memos)) {
            localStorage.setItem('memos', JSON.stringify(remoteData.memos));
          }
          if (Array.isArray(remoteData.pinnedMemos)) {
            localStorage.setItem('pinnedMemos', JSON.stringify(remoteData.pinnedMemos));
          }
          if (Array.isArray(remoteData.deletedMemoIds)) {
            setDeletedMemoTombstones(remoteData.deletedMemoIds);
          }

          const settings = remoteData.settings || {};
          if (settings.themeColor) {
            localStorage.setItem('themeColor', settings.themeColor);
          }
          if (settings.darkMode !== undefined) {
            localStorage.setItem('darkMode', String(settings.darkMode));
          }
          if (settings.hitokotoConfig) {
            localStorage.setItem('hitokotoConfig', JSON.stringify(settings.hitokotoConfig));
          }
          if (settings.fontConfig) {
            localStorage.setItem('fontConfig', JSON.stringify(settings.fontConfig));
          }
          if (settings.backgroundConfig) {
            localStorage.setItem('backgroundConfig', JSON.stringify(settings.backgroundConfig));
          }
          if (settings.avatarConfig) {
            localStorage.setItem('avatarConfig', JSON.stringify(settings.avatarConfig));
          }
          if (settings.canvasConfig !== undefined) {
            localStorage.setItem('canvasState', JSON.stringify(settings.canvasConfig));
          }
          if (settings.musicConfig) {
            localStorage.setItem('musicConfig', JSON.stringify(settings.musicConfig));
          }
          if (settings.keyboardShortcuts) {
            localStorage.setItem('keyboardShortcuts', JSON.stringify(settings.keyboardShortcuts));
          }

          try { window.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { part: 'restore.s3' } })); } catch {}
        } catch (error) {
          console.warn('从S3恢复数据失败:', error);
        }

        if (cloudSyncEnabled && s3Config?.enabled) {
          scheduleSync('post-restore');
        }
      } catch (e) {
        console.error('数据恢复失败:', e);
      }
    };

    maybeRestore();
  }, [cloudSyncEnabled, s3Config, scheduleSync, ensureS3Client]);
  // 手动同步：触发 S3 同步
  const manualSync = async () => {
    try {
      // 直接调用doSync进行完整同步
      await doSync();
      return { success: true, message: '同步完成' };
    } catch (e) {
      return { success: false, message: e?.message || '同步失败' };
    }
  };



  const updateHitokotoConfig = (newConfig) => {
    setHitokotoConfig(prev => ({ ...prev, ...newConfig }));
  };

  const updateFontConfig = (newConfig) => {
    setFontConfig(prev => ({ ...prev, ...newConfig }));
  };

  const updateBackgroundConfig = (newConfig) => {
    setBackgroundConfig(prev => ({ ...prev, ...newConfig }));
  };

  const updateAvatarConfig = (newConfig) => {
    setAvatarConfig(prev => ({ ...prev, ...newConfig }));
  };

  const updateCloudSyncEnabled = (enabled) => {
    setCloudSyncEnabled(enabled);
  };


  const updateAiConfig = (newConfig) => {
    setAiConfig(prev => ({ ...prev, ...newConfig }));
  };

  const updateKeyboardShortcuts = (newConfig) => {
    setKeyboardShortcuts(prev => ({ ...prev, ...newConfig }));
  };

  const updateMusicConfig = (newConfig) => {
    setMusicConfig(prev => ({ ...prev, ...newConfig }));
  };

  return (
    <SettingsContext.Provider value={{
      hitokotoConfig,
      updateHitokotoConfig,
      fontConfig,
      updateFontConfig,
      backgroundConfig,
      updateBackgroundConfig,
      avatarConfig,
      updateAvatarConfig,
      cloudSyncEnabled,
      updateCloudSyncEnabled,
      aiConfig,
      updateAiConfig,
      keyboardShortcuts,
      updateKeyboardShortcuts,
      manualSync,
      musicConfig,
      updateMusicConfig,
      s3Config,
      updateS3Config: setS3Config,
      // Sync helper
      _scheduleCloudSync: scheduleSync
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
