import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, MoreVertical, ArrowUp, X, Image } from 'lucide-react';
import MemoEditor from '@/components/MemoEditor';
import ContentRenderer from '@/components/ContentRenderer';
import { useTheme } from '@/context/ThemeContext';
import fileStorageService from '@/lib/fileStorageService';
import { toast } from 'sonner';
import { openStickyMemoWindow } from '@/lib/stickyMemoWindow';
import { isTauri } from '@/lib/utils';

const DRAG_THRESHOLD_PX = 24;
const OUTSIDE_MARGIN_PX = 12;
const INTERACTIVE_SELECTOR = 'button, a, textarea, input, [data-ignore-drag], [role="menu"], [role="dialog"], [contenteditable="true"]';

const MemoList = ({
  memos,
  pinnedMemos,
  activeMenuId,
  editingId,
  editContent,
  activeTag,
  activeDate, // 新增日期筛选状态
  showScrollToTop,
  menuRefs,
  memosContainerRef,
  onMenuAction,
  onMenuContainerEnter,
  onMenuContainerLeave,
  onMenuButtonClick,
  onEditContentChange,
  onSaveEdit,
  onCancelEdit,
  onTagClick,
  onScrollToTop,
  clearFilters, // 新增清除筛选函数
  // backlinks
  allMemos = [],
  onAddBacklink,
  onPreviewMemo,
  onRemoveBacklink,
  onAddAudioClip,
  onRemoveAudioClip,
  // 公开状态控制
  isAuthenticated = true
}) => {
  const { themeColor } = useTheme();
  const memosForBacklinks = (allMemos && allMemos.length) ? allMemos : [...pinnedMemos, ...memos];
  const editingWrapperRef = useRef(null);
  const [audioUrls, setAudioUrls] = useState({});
  const audioRefs = useRef({});
  const [playing, setPlaying] = useState({});
  const pointerStateRef = useRef(new Map());

  useEffect(() => {
    return () => {
      pointerStateRef.current.clear();
    };
  }, []);

  const attemptCreateStickyMemo = useCallback(async (memo, coords) => {
    if (!memo || !isTauri()) return;
    try {
      await openStickyMemoWindow(memo, coords);
      toast.success('已创建便签窗口');
    } catch (error) {
      console.error('Failed to open sticky memo window:', error);
      toast.error(error?.message || '创建便签窗口失败');
    }
  }, []);

  const formatMs = (ms) => {
    if (!ms && ms !== 0) return '';
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const createPointerDownHandler = (memo) => (event) => {
    if (!isTauri()) return;
    if (!memo) return;
    if (editingId && editingId === memo.id) return;

    if (typeof event.button === 'number' && event.button !== 0) return;
    if (typeof event.buttons === 'number' && event.buttons !== 1) return;

    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest(INTERACTIVE_SELECTOR)) {
      return;
    }

    const pointerId = event.pointerId;
    if (pointerId == null) return;

    const element = event.currentTarget;
    if (!element) return;

    const state = {
      memo,
      element,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      active: false
    };

    pointerStateRef.current.set(pointerId, state);
    try {
      element.setPointerCapture(pointerId);
    } catch {}
  };

  const handlePointerMove = (event) => {
    const state = pointerStateRef.current.get(event.pointerId);
    if (!state) return;

    state.lastClientX = event.clientX;
    state.lastClientY = event.clientY;
    state.lastScreenX = event.screenX;
    state.lastScreenY = event.screenY;

    if (state.active) {
      event.preventDefault();
      return;
    }

    const dx = event.clientX - state.startClientX;
    const dy = event.clientY - state.startClientY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      state.active = true;
      if (state.element) {
        state.element.dataset.dragging = 'true';
      }
      event.preventDefault();
    }
  };

  const finalizePointer = (event, shouldTrigger) => {
    const state = pointerStateRef.current.get(event.pointerId);
    if (!state) return;

    pointerStateRef.current.delete(event.pointerId);

    const element = state.element || event.currentTarget;
    if (element) {
      if (element.dataset && element.dataset.dragging) {
        delete element.dataset.dragging;
      }
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {}
    }

    if (!shouldTrigger || !state.active) return;

    const clientX = Number.isFinite(event.clientX) ? event.clientX : state.lastClientX;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : state.lastClientY;

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : Number.POSITIVE_INFINITY;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : Number.POSITIVE_INFINITY;

    const outsideViewport =
      clientX <= OUTSIDE_MARGIN_PX ||
      clientX >= (viewportWidth - OUTSIDE_MARGIN_PX) ||
      clientY <= OUTSIDE_MARGIN_PX ||
      clientY >= (viewportHeight - OUTSIDE_MARGIN_PX);

    if (!outsideViewport) return;

    const screenX = Number.isFinite(event.screenX) ? event.screenX : state.lastScreenX;
    const screenY = Number.isFinite(event.screenY) ? event.screenY : state.lastScreenY;

    attemptCreateStickyMemo(state.memo, { screenX, screenY });
  };

  const handlePointerUp = (event) => finalizePointer(event, true);
  const handlePointerCancel = (event) => finalizePointer(event, false);

  // Resolve audio urls for clips stored in indexeddb/base64
  useEffect(() => {
    const resolveAll = async () => {
      const next = { ...audioUrls };
      const lists = [memos, pinnedMemos];
      for (const list of lists) {
        for (const memo of list) {
          const clips = Array.isArray(memo.audioClips) ? memo.audioClips : [];
          for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            const key = `${memo.id}:${i}`;
            if (next[key]) continue;
            if (clip && clip.url) { next[key] = clip.url; continue; }
            if (clip && clip.storageType === 'base64' && clip.data) { next[key] = clip.data; continue; }
            if (clip && clip.storageType === 'indexeddb' && clip.id) {
              try {
                const restored = await fileStorageService.restoreFile(clip);
                if (restored && restored.data) next[key] = restored.data;
              } catch {}
            }
          }
        }
      }
      setAudioUrls(next);
    };
    resolveAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos, pinnedMemos]);

  // 计算菜单位置
  const getMenuPosition = (memoId) => {
    const menuElement = menuRefs.current[memoId];
    if (!menuElement) return { style: { opacity: 0 } };

    const buttonRect = menuElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const menuWidth = 192; // w-48 = 192px
    const rightSpace = viewportWidth - buttonRect.right;

    let style = {
      top: buttonRect.bottom + 5,
      opacity: 1,
    };

    if (rightSpace < menuWidth) {
      // 如果右侧空间不足，将菜单对齐到按钮左侧
      style.right = 'auto';
      style.left = buttonRect.left - menuWidth + buttonRect.width;
    } else {
      // 否则对齐到按钮右侧
      style.right = viewportWidth - buttonRect.right;
      style.left = 'auto';
    }

    return { style };
  };

  // 当列表中有正在编辑的 memo 时，点击编辑器外自动保存并退出编辑
  useEffect(() => {
    if (!editingId) return;
    const handleOutside = (e) => {
      const el = editingWrapperRef.current;
      if (!el) return;
      const target = e.target;
      if (el.contains(target)) return; // 点击在编辑器内，忽略
      // 在编辑器外点击，自动保存并退出
      try {
        onSaveEdit?.(editingId);
      } catch {}
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [editingId, onSaveEdit]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 标题区域 */}
      <div className="p-3 sm:p-4 lg:p-6 pb-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 flex items-center flex-shrink-0">
            <Clock
              className="h-4 w-4 sm:h-5 sm:w-5 mr-2 transition-colors duration-300"
              style={{ color: themeColor }}
            />
            {isAuthenticated ? '近期想法' : 'Memos'}
          </h2>
          
          {/* 筛选条件显示区域 */}
          {(activeTag || activeDate) && (
            <div className="flex items-center mb-3 sm:mb-4">
              <div 
                className="flex items-center px-3 py-1 rounded-full text-sm"
                style={{ 
                  backgroundColor: `${themeColor}20`,
                  color: themeColor,
                  border: `1px solid ${themeColor}`
                }}
              >
                <span className="mr-2">
                  {activeTag ? `#${activeTag}` : activeDate}
                </span>
                <button 
                  onClick={clearFilters}
                  className="flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
                  style={{ color: themeColor }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 滚动容器 */}
  <div
        ref={memosContainerRef}
        className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 pb-3 sm:pb-4 lg:pb-6 min-h-[250px] scrollbar-hidden"
      >
    {memos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p>还没有记录任何想法</p>
              <p className="text-sm mt-2">在顶部输入框写下你的第一个想法吧</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-hidden">
            <div className="space-y-4 pb-4">
      {memos.map(memo => (
                <Card
                  key={memo.id}
                  className={`group hover:shadow-md transition-shadow rounded-xl shadow-sm relative bg-white dark:bg-gray-800 data-[dragging=true]:ring-2 data-[dragging=true]:ring-blue-300/70 dark:data-[dragging=true]:ring-blue-400/40 data-[dragging=true]:shadow-2xl ${
                    pinnedMemos.some(p => p.id === memo.id) ? 'border-l-4' : ''
                  }`}
                  style={pinnedMemos.some(p => p.id === memo.id) ? { borderLeftColor: themeColor } : {}}
                  onPointerDown={createPointerDownHandler(memo)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                >
                  <CardContent className="p-3 sm:p-4">

                    {/* 菜单按钮 - 只有登录用户才能看到 */}
                    {isAuthenticated && (
                    <div
                      className="absolute top-3 right-3 sm:top-4 sm:right-4"
                      ref={(el) => menuRefs.current[memo.id] = el}
                      onMouseEnter={() => onMenuContainerEnter(memo.id)}
                      onMouseLeave={onMenuContainerLeave}
                    >
                      <button
                        onClick={() => onMenuButtonClick(memo.id)}
                        className="p-1 rounded-full hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="操作菜单"
                      >
                        <MoreVertical className="h-4 w-4 text-gray-500" />
                      </button>

                      {/* 菜单面板 */}
                      {activeMenuId === memo.id && (
                        <div
                          className="fixed w-40 sm:w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700 transition-opacity duration-150"
                          onClick={(e) => e.stopPropagation()}
                          style={getMenuPosition(memo.id).style}
                        >
                          {/* 置顶/取消置顶按钮 */}
                          {pinnedMemos.some(p => p.id === memo.id) ? (
                            <button
                              onClick={(e) => onMenuAction(e, memo.id, 'unpin')}
                              className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 12l3-3 3 3M8 21l4-7 4 7M16 3h5v5M21 3l-7.5 7.5" />
                              </svg>
                              <span className="truncate">取消置顶</span>
                            </button>
                          ) : (
                            <button
                              onClick={(e) => onMenuAction(e, memo.id, 'pin')}
                              className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
                              </svg>
                              <span className="truncate">置顶</span>
                            </button>
                          )}

                          {/* 编辑按钮 */}
                          <button
                            onClick={(e) => onMenuAction(e, memo.id, 'edit')}
                            className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            <span className="truncate">编辑</span>
                          </button>

                          {/* 分享图按钮 */}
                          <button
                            onClick={(e) => onMenuAction(e, memo.id, 'share')}
                            className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          >
                            <Image className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">分享图</span>
                          </button>

                          {/* 删除按钮 */}
                          <button
                            onClick={(e) => onMenuAction(e, memo.id, 'delete')}
                            className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            <span className="truncate">删除</span>
                          </button>
                          
                          {/* memo信息 */}
                          <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1 px-3 py-2 sm:px-4 text-xs text-gray-500 dark:text-gray-400">
                            <div className="truncate">字数: {memo.content.length}字</div>
                            <div className="truncate">创建: {new Date(memo.createdAt).toLocaleString('zh-CN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</div>
                            <div className="truncate">修改: {new Date(memo.updatedAt).toLocaleString('zh-CN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                    
        {editingId === memo.id && isAuthenticated ? (
                      <div className="mb-4" ref={editingWrapperRef}>
                        <div className="relative">
                          <MemoEditor
                            value={editContent}
                            onChange={onEditContentChange}
                            placeholder="编辑想法..."
                            maxLength={5000}
                            showCharCount={true}
                            autoFocus={true}
                            memosList={memosForBacklinks}
                            currentMemoId={memo.id}
                            backlinks={Array.isArray(memo.backlinks) ? memo.backlinks : []}
                            onAddBacklink={onAddBacklink}
                            onPreviewMemo={onPreviewMemo}
                            onRemoveBacklink={onRemoveBacklink}
                            audioClips={Array.isArray(memo.audioClips) ? memo.audioClips : []}
                            onRemoveAudioClip={onRemoveAudioClip}
                            onAddAudioClip={onAddAudioClip}
                            onSubmit={() => onSaveEdit(memo.id)}
                          />
                        </div>
                      </div>
                    ) : (
                      <ContentRenderer
                        content={memo.content}
                        activeTag={activeTag}
                        onTagClick={onTagClick}
                      />
                    )}

                    {/* 反链 chips（展示在每条 memo 下面） */}
        {Array.isArray(memo.backlinks) && memo.backlinks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {memo.backlinks.map((bid) => {
          const m = memosForBacklinks.find(x => x.id === bid);
                          if (!m) return null;
                          return (
                            <span key={`${memo.id}-bk-${bid}`} className="inline-flex items-center group">
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreviewMemo?.(bid); }}
                                className="max-w-full inline-flex items-center gap-1 pl-2 pr-2 py-0.5 rounded-md bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                              >
                                <span className="truncate inline-block max-w-[200px]">{m.content?.replace(/\n/g, ' ').slice(0, 60) || '（无内容）'}</span>
                                {/* 小箭头图标 */}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
                                  <path d="M7 17L17 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                  <path d="M9 7H17V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              </button>
                              {/* hover 才出现的小 × */}
                              <button
                                type="button"
                                className="ml-1 w-4 h-4 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveBacklink?.(memo.id, bid); }}
                                aria-label="移除反链"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* 音频录音（展示在每条 memo 底部，芯片风格） */}
                    {Array.isArray(memo.audioClips) && memo.audioClips.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {memo.audioClips.map((clip, idx) => {
                          const key = `${memo.id}:${idx}`;
                          const src = clip?.url || clip?.data || audioUrls[key] || '';
                          const isPlaying = !!playing[key];
                          return (
                            <span key={key} className="inline-flex items-center group">
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); const el = audioRefs.current[key]; if (!el) return; if (el.paused) { el.play(); setPlaying(p=>({...p,[key]:true})); } else { el.pause(); setPlaying(p=>({...p,[key]:false})); } }}
                                className="max-w-full inline-flex items-center gap-1 pl-2 pr-2 py-0.5 rounded-md bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                title="播放录音"
                              >
                                {isPlaying ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                                    <path d="M8 6h3v12H8zM13 6h3v12h-3z" fill="currentColor" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                                    <path d="M8 5l12 7-12 7V5z" fill="currentColor" />
                                  </svg>
                                )}
                                <span className="truncate inline-block max-w-[200px]">录音{clip?.durationMs ? ` · ${formatMs(clip.durationMs)}` : ''}</span>
                              </button>
                              <audio
                                ref={(el) => { if (el) audioRefs.current[key] = el; }}
                                src={src}
                                style={{ display: 'none' }}
                                onEnded={() => setPlaying((p) => ({ ...p, [key]: false }))}
                              />
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-end space-x-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(memo.updatedAt).toLocaleString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* 回到顶部按钮 */}
        {showScrollToTop && (
          <button
            onClick={onScrollToTop}
            className="absolute bottom-6 right-6 z-30 flex items-center justify-center w-12 h-12 rounded-full bg-gray-200/90 dark:bg-gray-700/90 text-gray-700 dark:text-gray-300 transition-all duration-300 hover:bg-gray-300/90 dark:hover:bg-gray-600/90 hover:scale-110 shadow-lg backdrop-blur-sm border border-gray-300/20 dark:border-gray-600/20"
            aria-label="回到顶部"
            title="回到顶部"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MemoList;
