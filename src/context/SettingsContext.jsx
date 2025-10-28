import React, { createContext, useContext, useState, useEffect } from 'react';
import { D1DatabaseService } from '@/lib/d1';
import { D1ApiClient } from '@/lib/d1-api';
import { usePasswordAuth } from './PasswordAuthContext';
import { getDeletedMemoTombstones, removeDeletedMemoTombstones } from '@/lib/utils';
import largeFileStorage from '@/lib/largeFileStorage';
import { toast } from 'sonner';

const SettingsContext = createContext();
const isSelfHosted = String(import.meta.env.VITE_SELF_HOSTED || '').toLowerCase() === 'true';

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }) {
  const { isAuthenticated } = usePasswordAuth();
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
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(() => isSelfHosted);
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

  // ---- Auto sync scheduler (debounced) ----
  const syncTimerRef = React.useRef(null);
  const hardTimerRef = React.useRef(null); // minimal interval limiter
  const syncingRef = React.useRef(false);
  const pendingRef = React.useRef(false);
  const lastSyncAtRef = React.useRef(0);

  // 游客模式数据刷新逻辑
  const refreshPublicData = React.useCallback(async () => {
    if (isAuthenticated) return; // 只在游客模式下执行

    try {
      let res;
      try {
        // 优先使用API获取公开数据
        res = await D1ApiClient.getPublicData();
      } catch (apiError) {
        console.warn('API获取公开数据失败，尝试直接数据库访问:', apiError);
        // API失败时降级到直接数据库访问
        const dbMemos = await D1DatabaseService.getPublicMemos();
        res = {
          success: true,
          data: { memos: dbMemos }
        };
      }

      if (res?.success && res.data?.memos) {
        const currentMemos = JSON.parse(localStorage.getItem('memos') || '[]');
        const newMemos = res.data.memos.map(memo => ({
          id: memo.memo_id,
          content: memo.content,
          tags: JSON.parse(memo.tags || '[]'),
          backlinks: JSON.parse(memo.backlinks || '[]'),
          audioClips: JSON.parse(memo.audio_clips || '[]'),
          is_public: memo.is_public ? true : false,
          timestamp: memo.created_at,
          lastModified: memo.updated_at,
          createdAt: memo.created_at,
          updatedAt: memo.updated_at
        }));

        // 检查是否有新数据
        const currentIds = new Set(currentMemos.map(m => m.id));
        const newIds = new Set(newMemos.map(m => m.id));
        const hasNewData = newMemos.length !== currentMemos.length ||
          !Array.from(newIds).every(id => currentIds.has(id));

        if (hasNewData) {
          localStorage.setItem('memos', JSON.stringify(newMemos));
          try {
            window.dispatchEvent(new CustomEvent('app:dataChanged', {
              detail: { part: 'guest.refresh', newCount: newMemos.length - currentMemos.length }
            }));
          } catch {}
        }
      }
    } catch (error) {
      console.error('刷新公开数据失败:', error);
    }
  }, [isAuthenticated]);

  // 游客模式定期刷新
  useEffect(() => {
    if (isAuthenticated) return; // 只在游客模式下执行

    // 立即检查一次
    refreshPublicData();

    // 设置定期刷新 (每2分钟)
    const interval = setInterval(refreshPublicData, 2 * 60 * 1000);

    // 页面获得焦点时也刷新一次
    const onFocus = () => refreshPublicData();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated, refreshPublicData]);

  const dispatchDataChanged = (detail = {}) => {
    try {
      window.dispatchEvent(new CustomEvent('app:dataChanged', { detail }));
    } catch {}
  };

  const doSync = React.useCallback(async () => {
    if (!cloudSyncEnabled) return;
    if (syncingRef.current) { pendingRef.current = true; return; }

    // 🔧 添加同步节流，避免频繁冲突
    const now = Date.now();
    const minInterval = 5000; // 最小5秒间隔
    if (now - lastSyncAtRef.current < minInterval) {
      // 太频繁，稍后重试
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
  // 先下行：从D1拉取远端数据
      const lastSyncAt = Number(localStorage.getItem('lastCloudSyncAt') || 0);
      let cloudMemos = [];

      try {
        const res = await D1ApiClient.restoreUserData();
        if (res?.success) {
          cloudMemos = (res.data?.memos || []).map(m => ({
            memo_id: m.memo_id,
            content: m.content,
            tags: JSON.parse(m.tags || '[]'),
            backlinks: JSON.parse(m.backlinks || '[]'),
            audio_clips: JSON.parse(m.audio_clips || '[]'),
            is_public: m.is_public ? true : false,
            created_at: m.created_at,
            updated_at: m.updated_at
          }));
        } else {
          throw new Error('restore via API failed');
        }
      } catch {
        try {
          const ms = await D1DatabaseService.getAllMemos();
          cloudMemos = (ms || []).map(m => ({
            memo_id: m.memo_id,
            content: m.content,
            tags: JSON.parse(m.tags || '[]'),
            backlinks: JSON.parse(m.backlinks || '[]'),
            audio_clips: JSON.parse(m.audio_clips || '[]'),
            is_public: m.is_public ? true : false,
            created_at: m.created_at,
            updated_at: m.updated_at
          }));
        } catch {}
      }

  // 与本地对比并应用远端 删除/更新/新增
      try {
  const localMemos = JSON.parse(localStorage.getItem('memos') || '[]');
  const pinned = JSON.parse(localStorage.getItem('pinnedMemos') || '[]');
  const pinnedMap = new Map((Array.isArray(pinned) ? pinned : []).map(m => [String(m.id), m]));
  const pinnedIds = new Set(Array.isArray(pinned) ? pinned.map(m => String(m.id)) : []);
        const localMap = new Map((localMemos || []).map(m => [String(m.id), m]));
        const cloudMap = new Map((cloudMemos || []).map(m => [String(m.memo_id), m]));
        
  // 获取当前的删除墓碑，避免恢复已标记删除的 memo
        const tombstones = getDeletedMemoTombstones();
        const deletedSet = new Set((tombstones || []).map(t => String(t.id)));

        let changed = false;

  // 1) 远端不存在且本地更新时间 <= lastSyncAt -> 视为远端已删除，移除本地
        const keptLocal = [];
        const removedIds = [];
        for (const m of localMemos) {
          const id = String(m.id);
          // 如果本地已标记删除，直接过滤，避免被下行合并重新写回复活
          if (deletedSet.has(id)) {
            removedIds.push(id);
            changed = true;
            continue;
          }
          if (cloudMap.has(id)) {
            keptLocal.push(m);
            continue;
          }
          const lRaw = m.updatedAt || m.lastModified || m.timestamp || m.createdAt || null;
          const lTime = lRaw ? new Date(lRaw).getTime() : NaN;

          // 🔧 修复：更保守的删除策略，避免误删新memo
          // 只有在以下条件ALL满足时才删除：
          // 1. 有有效的同步时间记录 (lastSyncAt > 0)
          // 2. 本地memo有有效时间戳
          // 3. 本地memo创建时间明显早于最后同步时间(至少30秒)
          // 4. 本地memo更新时间也早于最后同步时间
          if (lastSyncAt > 0 && Number.isFinite(lTime)) {
            const createdTime = new Date(m.createdAt || m.timestamp || lRaw).getTime();
            const timeSinceSync = lastSyncAt - Math.max(lTime, createdTime);

            // 只删除明显是"旧数据且远端已删"的memo (30秒缓冲)
            if (timeSinceSync > 30000) {
              removedIds.push(id);
              changed = true;
            } else {
              // 疑似新memo或时间接近，保守保留，待下次同步确认
              keptLocal.push(m);
            }
          } else {
            // 没有同步基准或时间信息不完整，保守保留
            keptLocal.push(m);
          }
        }

  // 2) 远端更新需要覆盖本地；远端新增拉取到本地
        const mergedById = new Map(keptLocal.map(m => [String(m.id), m]));
        // Safety net: ensure all local (non-tombstoned) memos are kept even if cloud is missing them
        // This prevents accidental loss when refreshing before upload finishes
        for (const m of localMemos) {
          const id = String(m.id);
          if (!deletedSet.has(id) && !mergedById.has(id)) {
            mergedById.set(id, m);
            changed = true;
          }
        }
        let pinnedChanged = false;
        for (const [id, cm] of cloudMap.entries()) {
          // 跳过已标记删除的 memo，避免覆盖
          if (deletedSet.has(id)) {
            continue;
          }
          // 若该 memo 当前在本地处于置顶，只更新置顶数据，不重复加入 memos 列表，避免 pin 时合并重复
          if (pinnedIds.has(id)) {
            const pm = pinnedMap.get(id);
            const pTime = new Date(pm?.updatedAt || pm?.lastModified || pm?.timestamp || pm?.createdAt || 0).getTime();
            const cTime = new Date(cm.updated_at || cm.created_at || 0).getTime();
            if (cTime > pTime) {
              pinnedMap.set(id, {
                ...pm,
                content: cm.content,
                tags: cm.tags || [],
                backlinks: cm.backlinks || [],
                audioClips: cm.audio_clips || pm.audioClips || [],
                is_public: cm.is_public ? true : false, // 🔧 添加is_public字段映射
                updatedAt: cm.updated_at,
                lastModified: cm.updated_at
              });
              pinnedChanged = true;
            }
            continue;
          }
          
          const lm = mergedById.get(id);
          const cTime = new Date(cm.updated_at || cm.created_at || 0).getTime();
          if (!lm) {
            // 本地没有，直接拉取进来
            mergedById.set(id, {
              id,
              content: cm.content,
              tags: cm.tags || [],
              backlinks: cm.backlinks || [],
              audioClips: Array.isArray(cm.audio_clips) ? cm.audio_clips : [],
              is_public: cm.is_public ? true : false, // 🔧 添加is_public字段映射
              createdAt: cm.created_at,
              updatedAt: cm.updated_at,
              timestamp: cm.created_at,
              lastModified: cm.updated_at
            });
            changed = true;
          } else {
            const lTime = new Date(lm.updatedAt || lm.lastModified || lm.timestamp || lm.createdAt || 0).getTime();
            if (cTime > lTime) {
              // 远端更新，覆盖
              mergedById.set(id, {
                ...lm,
                content: cm.content,
                tags: cm.tags || [],
                backlinks: cm.backlinks || [],
                audioClips: Array.isArray(cm.audio_clips) ? cm.audio_clips : (Array.isArray(lm.audioClips) ? lm.audioClips : []),
                is_public: cm.is_public ? true : false, // 🔧 添加is_public字段映射
                updatedAt: cm.updated_at,
                lastModified: cm.updated_at
              });
              changed = true;
            }
          }
        }

                if (changed) {
          const merged = Array.from(mergedById.values()).map(m => ({
            ...m,
            backlinks: Array.isArray(m.backlinks) ? m.backlinks : [],
            audioClips: Array.isArray(m.audioClips) ? m.audioClips : [],
            is_public: typeof m.is_public === 'boolean' ? m.is_public : false // 🔧 确保is_public字段一致性
          })).sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));
          localStorage.setItem('memos', JSON.stringify(merged));
          if (removedIds.length && Array.isArray(pinned)) {
            const removedSet = new Set(removedIds.map(String));
            const nextPinned = pinned.filter((p) => {
              const pid = (p && typeof p === 'object') ? p.id : p;
              return !removedSet.has(String(pid));
            });
            if (nextPinned.length !== pinned.length) {
              localStorage.setItem('pinnedMemos', JSON.stringify(nextPinned));
            }
          }
          // 通知页面刷新本地缓存
          try { window.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { part: 'sync.downmerge' } })); } catch {}
        }
        if (pinnedChanged) {
          const nextPinnedArr = Array.from(pinnedMap.values());
          localStorage.setItem('pinnedMemos', JSON.stringify(nextPinnedArr));
          try { window.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { part: 'sync.downmerge' } })); } catch {}
        }
      } catch {
  // 忽略下行合并失败，继续尝试上行
      }

  // 再进行上行同步到D1（upsert settings & memos）
      await (async () => {
        // 优先 API 客户端，失败降级
        try {
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
            musicConfig: JSON.parse(localStorage.getItem('musicConfig') || '{"enabled":true,"customSongs":[]}')
          };
          await D1ApiClient.syncUserData(localData);
        } catch (_) {
          await D1DatabaseService.syncUserData();
        }
      })();

  // 然后处理删除墓碑，推送远端删除
      const tombstones = getDeletedMemoTombstones();
      if (tombstones && tombstones.length) {
        const ids = tombstones.map(t => t.id);
        for (const id of ids) {
          try {
            await D1ApiClient.deleteMemo(id);
          } catch {
            try {
              await D1DatabaseService.deleteMemo(id);
            } catch {}
          }
        }
        removeDeletedMemoTombstones(ids);
      }
  lastSyncAtRef.current = Date.now();
      localStorage.setItem('lastCloudSyncAt', String(lastSyncAtRef.current));
    } finally {
      syncingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        // chain another run after a short delay to batch rapid changes
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(doSync, 500);
      }
    }
  }, [cloudSyncEnabled, isAuthenticated]);

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
    if (isSelfHosted) {
      setCloudSyncEnabled(true);
      localStorage.setItem('cloudSyncEnabled', 'true');
    } else {
      const savedCloudSyncEnabled = localStorage.getItem('cloudSyncEnabled');
      if (savedCloudSyncEnabled) {
        try {
          setCloudSyncEnabled(JSON.parse(savedCloudSyncEnabled));
        } catch (error) {
          console.warn('Failed to parse cloud sync config:', error);
        }
      }
    }

  }, [isSelfHosted]);

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
            const svc = require('@/lib/s3Storage').default;
            svc.init(parsedConfig);
          }
        } catch (e) {
          console.warn('Init S3 on load failed:', e);
        }
      }
    } catch (error) {
      console.warn('Failed to parse S3 config:', error);
    }
  }, []);

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
    if (isSelfHosted) {
      localStorage.setItem('cloudSyncEnabled', 'true');
      return;
    }
    localStorage.setItem('cloudSyncEnabled', JSON.stringify(cloudSyncEnabled));
  }, [cloudSyncEnabled, isSelfHosted]);

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
      const svc = require('@/lib/s3Storage').default;
      if (s3Config && s3Config.enabled) {
        svc.init(s3Config);
      }
    } catch (e) {
  // 仅写日志，不打断设置保存
      console.warn('Init S3 on change failed:', e);
    }
  }, [s3Config]);

  // Subscribe to app-level data change events and page lifecycle to auto sync
  useEffect(() => {
    if (!cloudSyncEnabled) return;
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
  }, [cloudSyncEnabled, scheduleSync, doSync]);

  // Try restore on startup when local is empty (for both authenticated and guest users)
  useEffect(() => {
    const maybeRestore = async () => {
      try {
        const memos = JSON.parse(localStorage.getItem('memos') || '[]');
        const pinned = JSON.parse(localStorage.getItem('pinnedMemos') || '[]');
        const hasLocal = (Array.isArray(memos) && memos.length > 0) || (Array.isArray(pinned) && pinned.length > 0);

        if (hasLocal) {
          // 🔧 修复：本地有数据时不要被远端无条件覆盖
          // 而是进行智能合并，保留本地更新的数据
          if (isAuthenticated && cloudSyncEnabled) {
            // 对于认证用户，执行合并同步而不是覆盖同步
            scheduleSync('startup-merge');
          }
          return;
        }

        // 简化逻辑：只使用D1，移除Supabase复杂判断
        // 对于游客模式，获取公开数据；对于认证用户，获取全部数据
        try {
          let res;
          if (!isAuthenticated) {
            // 游客模式：只获取公开数据
            res = await D1ApiClient.getPublicData();
          } else {
            // 认证用户：获取全部数据
            res = await D1ApiClient.restoreUserData();
          }

          if (!res?.success) throw new Error('API restore failed');

          // 恢复memos数据
          if (res.data?.memos && res.data.memos.length > 0) {
            const localMemos = res.data.memos.map(memo => ({
              id: memo.memo_id,
              content: memo.content,
              tags: JSON.parse(memo.tags || '[]'),
              backlinks: JSON.parse(memo.backlinks || '[]'),
              audioClips: JSON.parse(memo.audio_clips || '[]'),
              is_public: memo.is_public ? true : false,
              timestamp: memo.created_at,
              lastModified: memo.updated_at,
              createdAt: memo.created_at,
              updatedAt: memo.updated_at
            }));
            localStorage.setItem('memos', JSON.stringify(localMemos));
          }

          try { window.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { part: 'restore.d1.api' } })); } catch {}
        } catch (apiError) {
          console.warn('D1 API客户端失败，尝试直接访问D1数据库', apiError);

          try {
            let dbMemos;
            if (!isAuthenticated) {
              // 游客模式：只获取公开memo
              dbMemos = await D1DatabaseService.getPublicMemos();
            } else {
              // 认证用户：获取全部memo
              dbMemos = await D1DatabaseService.getAllMemos();
            }

            if (dbMemos && dbMemos.length > 0) {
              const localMemos = dbMemos.map(memo => ({
                id: memo.memo_id,
                content: memo.content,
                tags: JSON.parse(memo.tags || '[]'),
                backlinks: JSON.parse(memo.backlinks || '[]'),
                audioClips: JSON.parse(memo.audio_clips || '[]'),
                is_public: memo.is_public ? true : false,
                timestamp: memo.created_at,
                lastModified: memo.updated_at,
                createdAt: memo.created_at,
                updatedAt: memo.updated_at
              }));
              localStorage.setItem('memos', JSON.stringify(localMemos));
            }

            try { window.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { part: 'restore.d1.db' } })); } catch {}
          } catch (dbError) {
            console.error('D1数据库直接访问也失败:', dbError);
          }
        }

        // 认证用户才需要同步推送
        if (isAuthenticated && cloudSyncEnabled) {
          scheduleSync('post-restore');
        }
      } catch (e) {
        console.error('数据恢复失败:', e);
      }
    };

    maybeRestore();
  }, [isAuthenticated, scheduleSync, cloudSyncEnabled]); // 添加isAuthenticated依赖

  // 简化的手动同步流程：仅使用D1
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
    if (isSelfHosted) {
      setCloudSyncEnabled(true);
      return;
    }
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

  // D1 同步功能
  const syncToD1 = async () => {
    try {
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
  canvasConfig: JSON.parse(localStorage.getItem('canvasState') || 'null')
      };

  // 优先尝试使用 API 客户端（适用于 Cloudflare Pages）
      try {
        const result = await D1ApiClient.syncUserData(localData);
        return result;
      } catch (apiError) {
  console.warn('D1 API 客户端失败，尝试直接访问 D1 数据库', apiError);
        
  // 如果 API 客户端失败，尝试直接访问 D1 数据库（适用于 Cloudflare Workers）
        const result = await D1DatabaseService.syncUserData();
        return result;
      }
    } catch (error) {
  console.error('同步到 D1 失败:', error);
      return { success: false, message: error.message };
    }
  };

  const restoreFromD1 = async () => {
    try {
  // 优先尝试使用 API 客户端（适用于 Cloudflare Pages）
      try {
        const result = await D1ApiClient.restoreUserData();
        
        if (result.success) {
          // 恢复到本地存储
          if (result.data.memos && result.data.memos.length > 0) {
            const localMemos = result.data.memos.map(memo => ({
              id: memo.memo_id,
              content: memo.content,
              tags: JSON.parse(memo.tags || '[]'),
              timestamp: memo.created_at,
              lastModified: memo.updated_at,
              createdAt: memo.created_at,
              updatedAt: memo.updated_at
            }));
            localStorage.setItem('memos', JSON.stringify(localMemos));
          }

          if (result.data.settings) {
            if (result.data.settings.pinned_memos) {
              localStorage.setItem('pinnedMemos', result.data.settings.pinned_memos);
            }
            if (result.data.settings.theme_color) {
              localStorage.setItem('themeColor', result.data.settings.theme_color);
            }
            if (result.data.settings.dark_mode !== null) {
              localStorage.setItem('darkMode', result.data.settings.dark_mode.toString());
            }
            if (result.data.settings.hitokoto_config) {
              localStorage.setItem('hitokotoConfig', result.data.settings.hitokoto_config);
            }
            if (result.data.settings.font_config) {
              localStorage.setItem('fontConfig', result.data.settings.font_config);
            }
            if (result.data.settings.background_config) {
              localStorage.setItem('backgroundConfig', result.data.settings.background_config);
            }
            if (result.data.settings.avatar_config) {
              localStorage.setItem('avatarConfig', result.data.settings.avatar_config);
            }
            if (result.data.settings.canvas_config) {
              localStorage.setItem('canvasState', result.data.settings.canvas_config);
            }
          }
          
          return { success: true, message: '从 D1 恢复数据成功，请刷新页面查看' };
        }
        
  throw new Error(result.message || '恢复数据失败');
      } catch (apiError) {
  console.warn('D1 API 客户端失败，尝试直接访问 D1 数据库', apiError);
        
        // 濡傛灉API瀹㈡埛绔け璐ワ紝灏濊瘯鐩存帴璁块棶D1鏁版嵁搴擄紙閫傜敤浜嶤loudflare Workers锛?
  const result = await D1DatabaseService.restoreUserData();
        return result;
      }
    } catch (error) {
  console.error('从 D1 恢复失败:', error);
      return { success: false, message: error.message };
    }
  };

  return (
    <SettingsContext.Provider value={{
      isSelfHosted,
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
      syncToD1,
      restoreFromD1,
      aiConfig,
      updateAiConfig,
      keyboardShortcuts,
      updateKeyboardShortcuts,
      manualSync,
      musicConfig,
      updateMusicConfig,
      s3Config,
      updateS3Config: setS3Config,
      // Sync public helpers
      _scheduleCloudSync: scheduleSync,
      // 游客模式刷新功能
      refreshPublicData
    }}>
      {children}
    </SettingsContext.Provider>
  );
}





