import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { X, Pin, PinOff } from 'lucide-react';
import ContentRenderer from '@/components/ContentRenderer';
import { useTheme } from '@/context/ThemeContext';
import { useSettings } from '@/context/SettingsContext';
import { isTauri } from '@/lib/utils';
import { STICKY_WINDOW_HEIGHT, STICKY_WINDOW_WIDTH } from '@/lib/stickyMemoWindow';

let cachedAppWindow = null;
let cachedWebviewWindow = null;

async function getAppWindow() {
  if (!isTauri()) return null;
  if (cachedAppWindow) return cachedAppWindow;
  const mod = await import('@tauri-apps/api/window');
  cachedAppWindow = mod.appWindow;
  return cachedAppWindow;
}

async function getCurrentWindow() {
  if (!isTauri()) return null;
  if (cachedWebviewWindow) return cachedWebviewWindow;
  const mod = await import('@tauri-apps/api/window');
  cachedWebviewWindow = mod.getCurrentWindow();
  return cachedWebviewWindow;
}

const formatDateTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
};

const StickyMemoWindow = () => {
  const { memoId } = useParams();
  const [searchParams] = useSearchParams();
  const { themeColor } = useTheme();
  const { fontConfig } = useSettings();
  const [memo, setMemo] = useState(null);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);

  const loadMemoFromStorage = useCallback(() => {
    try {
      const savedPinned = localStorage.getItem('pinnedMemos');
      const savedMemos = localStorage.getItem('memos');
      const pinnedList = savedPinned ? JSON.parse(savedPinned) : [];
      const memoList = savedMemos ? JSON.parse(savedMemos) : [];
      const combined = [...pinnedList, ...memoList];
      const found = combined.find((item) => String(item?.id) === String(memoId));
      setMemo(found || null);
    } catch (error) {
      console.warn('Failed to load memo for sticky window:', error);
      setMemo(null);
    }
  }, [memoId]);

  useEffect(() => {
    loadMemoFromStorage();
  }, [loadMemoFromStorage, memoId, searchParams]);

  useEffect(() => {
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevBodyMargin = document.body.style.margin;
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    document.body.style.margin = '0';
    return () => {
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
      document.body.style.margin = prevBodyMargin;
    };
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (!event.key || event.key === 'memos' || event.key === 'pinnedMemos') {
        loadMemoFromStorage();
      }
    };
    const onAppDataChanged = (event) => {
      const part = event?.detail?.part || '';
      if (part.includes('memo') || part.includes('sync') || part.includes('pinned')) {
        loadMemoFromStorage();
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('app:dataChanged', onAppDataChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('app:dataChanged', onAppDataChanged);
    };
  }, [loadMemoFromStorage]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    (async () => {
      const appWindow = await getAppWindow();
      if (!appWindow || disposed) return;
      try {
        await appWindow.setAlwaysOnTop(true);
        setAlwaysOnTop(true);
      } catch {}
      try {
        await appWindow.setDecorations(false);
      } catch {}
      try {
        await appWindow.setFocus();
      } catch {}
    })();
    return () => {
      disposed = true;
    };
  }, []);

  const handleClose = async () => {
    if (isTauri()) {
      const appWindow = await getAppWindow();
      if (appWindow) {
        await appWindow.close();
        return;
      }
    }
    window.close();
  };

  const handleToggleAlwaysOnTop = async () => {
    if (!isTauri()) return;
    const appWindow = await getAppWindow();
    if (!appWindow) return;
    const next = !alwaysOnTop;
    try {
      await appWindow.setAlwaysOnTop(next);
      setAlwaysOnTop(next);
    } catch (error) {
      console.warn('Failed to toggle always on top:', error);
    }
  };

  const handleMouseDown = async (e) => {
    if (!isTauri()) return;
    if (e.target.closest('button') || e.target.closest('[data-tauri-drag-region="false"]')) return;
    
    try {
      const appWindow = await getCurrentWindow();
      if (appWindow) {
        await appWindow.startDragging();
      }
    } catch (error) {
      console.warn('Failed to start dragging:', error);
    }
  };

  const tags = useMemo(() => {
    if (!memo?.tags) return [];
    return Array.isArray(memo.tags) ? memo.tags : [];
  }, [memo?.tags]);

  const createdLabel = memo ? formatDateTime(memo.createdAt || memo.timestamp) : '';
  const updatedLabel = memo ? formatDateTime(memo.updatedAt || memo.lastModified) : '';

  return (
    <div
      className="w-full h-full bg-transparent overflow-hidden flex items-stretch justify-stretch"
      style={{ width: `${STICKY_WINDOW_WIDTH}px`, height: `${STICKY_WINDOW_HEIGHT}px` }}
      onMouseDown={handleMouseDown}
    >
      <div className="flex h-full w-full flex-col rounded-lg border border-slate-200/70 dark:border-slate-700/60 bg-white/95 dark:bg-slate-900/95 shadow-[0_18px_45px_-20px_rgba(15,23,42,0.45)] backdrop-blur-sm overflow-hidden">
        <header className="flex items-start justify-between px-5 pt-5 pb-3 select-none" data-tauri-drag-region>
          {isTauri() && (
            <div className="flex items-center gap-2">
              <button
                className="rounded-full p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/80 transition-colors"
                onClick={handleToggleAlwaysOnTop}
                title={alwaysOnTop ? '取消置顶' : '置顶窗口'}
                data-tauri-drag-region="false"
              >
                {alwaysOnTop ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
              </button>
              <button
                className="rounded-full p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/80 transition-colors"
                onClick={handleClose}
                title="关闭"
                data-tauri-drag-region="false"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </header>

        {memo && tags.length > 0 && (
          <div className="px-5 pb-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-1 rounded-full border border-slate-200/70 dark:border-slate-700/70 text-slate-500 dark:text-slate-300"
                style={{ backgroundColor: `${themeColor}10` }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <main
          className="flex-1 px-5 pb-4 custom-font-content text-slate-800 dark:text-slate-100 text-base leading-relaxed overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300/60 dark:scrollbar-thumb-slate-600/60"
          style={fontConfig?.fontSize ? { fontSize: `${fontConfig.fontSize}px` } : undefined}
          data-tauri-drag-region="false"
        >
          {memo ? (
            memo.content ? (
              <ContentRenderer content={memo.content} activeTag={null} onTagClick={() => {}} />
            ) : (
              <div className="text-slate-400 italic">暂时没有内容</div>
            )
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-center space-y-3 text-slate-500">
              <div className="text-base font-medium text-slate-600 dark:text-slate-200">找不到这条便签</div>
              <p className="text-sm leading-relaxed text-slate-400 dark:text-slate-400">
                请在主窗口检查这条 memo 是否仍然存在。
              </p>
              <button
                className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: themeColor }}
                onClick={handleClose}
              >
                关闭窗口
              </button>
            </div>
          )}
        </main>

        <footer className="flex items-center justify-start px-5 pb-4 text-[11px] text-slate-400 dark:text-slate-500 select-none" data-tauri-drag-region="false">
          <span>{memo ? `更新于 ${updatedLabel || '未知'}` : '便签窗口'}</span>
        </footer>
      </div>
    </div>
  );
};

export default StickyMemoWindow;
