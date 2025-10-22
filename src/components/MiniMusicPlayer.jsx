import React from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, SkipBack, SkipForward, ListMusic, X } from 'lucide-react';
import { useMusic } from '@/context/MusicContext';
import MusicPlaylistDialog from './MusicPlaylistDialog';

// 迷你音乐播放器（右下角悬浮矩形）
// 协调播放：
// - 监听 window 事件 'music:play' / 'music:pause' / 'music:source' / 'music:globalDisable'
// - 当自身播放时，派发 'music:pause-others' 让其它实例暂停（例如弹窗）
export default function MiniMusicPlayer({
  onOpenFull,
}) {
  const audioRef = React.useRef(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [isLoop, setIsLoop] = React.useState(false);
  const [volOpen, setVolOpen] = React.useState(false);
  const volRef = React.useRef(null);
  const [lyrics, setLyrics] = React.useState([]);
  const [showLyrics, setShowLyrics] = React.useState(false);
  const [currentLyricIndex, setCurrentLyricIndex] = React.useState(-1);
  const lyricsRef = React.useRef(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    try {
      const saved = localStorage.getItem('music:playerCollapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const {
    getCurrentSong,
    isPlaying,
    togglePlay,
    playNext,
    playPrevious,
    setPlayingState,
    playSong,
    playlist,
    currentSongIndex,
    showPlaylist,
    setShowPlaylist,
    volume,
  setVolume,
  deleteSongAtIndex
  } = useMusic();

  const currentSong = getCurrentSong();

  // 解析 LRC 文本
  const parseLrc = React.useCallback((lrcText) => {
    if (!lrcText || typeof lrcText !== 'string') return [];
    const lines = lrcText.split(/\r?\n/);
    const result = [];
    const timeTagGlobal = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
    const toTime = (m, s, ms) => (m * 60 + s + (ms || 0) / 1000);
    const fmt = (sec) => `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
    for (const raw of lines) {
      const times = [...raw.matchAll(timeTagGlobal)];
      if (!times.length) continue;
      const text = raw.replace(timeTagGlobal, '').trim();
      if (!text) continue;
      for (const t of times) {
        const m = parseInt(t[1], 10) || 0;
        const s = parseInt(t[2], 10) || 0;
        const ms = parseInt(t[3] || '0', 10) || 0;
        const seconds = toTime(m, s, ms);
        result.push({ time: fmt(seconds), text });
      }
    }
    const toSec = (ts) => {
      const [m, s] = ts.split(':');
      return (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
    };
    return result.sort((a, b) => toSec(a.time) - toSec(b.time));
  }, []);

  // 加载歌词（优先使用 currentSong.lyrics 的 LRC；否则回退到本地 JSON）
  React.useEffect(() => {
    let aborted = false;
    const tryLocalJson = async (title) => {
      try {
        const r = await fetch(`/ci/${title}.json`);
        if (!r.ok) throw new Error('no local');
        const data = await r.json();
        if (!aborted) setLyrics(Array.isArray(data?.lyrics) ? data.lyrics : []);
      } catch {
        if (!aborted) setLyrics([]);
      }
    };
    if (!currentSong) return;
    if (currentSong.lyrics && typeof currentSong.lyrics === 'string' && currentSong.lyrics.includes('[')) {
      const parsed = parseLrc(currentSong.lyrics);
      setLyrics(parsed);
    } else if (currentSong.title) {
      tryLocalJson(currentSong.title);
    } else {
      setLyrics([]);
    }
    return () => { aborted = true; };
  }, [currentSong?.title, currentSong?.lyrics, parseLrc]);

  // 根据 currentTime 计算当前行
  const timeToSeconds = (timeStr) => {
    const [m, s] = (timeStr || '0:0').split(':').map(parseFloat);
    return (m || 0) * 60 + (s || 0);
  };
  React.useEffect(() => {
    if (!lyrics.length) { setCurrentLyricIndex(-1); return; }
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      const t = timeToSeconds(lyrics[i].time);
      if (currentTime >= t) idx = i; else break;
    }
    setCurrentLyricIndex(idx);
  }, [currentTime, lyrics]);

  // 自动滚动到当前行
  React.useEffect(() => {
    const el = lyricsRef.current;
    if (!el) return;
    if (currentLyricIndex >= 2) {
      const top = (currentLyricIndex - 2) * 30;
      el.scrollTo({ top, behavior: 'smooth' });
    } else {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentLyricIndex]);

  // 当歌曲变化时，重新加载音频
  React.useEffect(() => {
    if (audioRef.current && currentSong?.musicUrl) {
      audioRef.current.src = currentSong.musicUrl;
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch(error => {
          console.error('Failed to play audio:', error);
          setPlayingState(false);
        });
      }
    }
  }, [currentSong?.musicUrl]);

  // 同步播放状态到音频元素
  React.useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(error => {
          console.error('Failed to play audio:', error);
          setPlayingState(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  React.useEffect(() => {
    const onPauseOthers = () => {
      if (audioRef.current) audioRef.current.pause();
      setPlayingState(false);
    };
    const onGlobalDisable = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingState(false);
      setCurrentTime(0);
    };
    const onPlayCmd = () => {
      if (!audioRef.current) return;
      try { window.dispatchEvent(new CustomEvent('music:pause-others')); } catch {}
      audioRef.current.play();
      setPlayingState(true);
    };
    const onPauseCmd = () => {
      if (!audioRef.current) return;
      audioRef.current.pause();
      setPlayingState(false);
    };
    const onSeekCmd = (e) => {
      if (!audioRef.current) return;
      const t = Number(e?.detail?.time) || 0;
      const d = isFinite(duration) && duration > 0 ? duration : t + 0.001;
      audioRef.current.currentTime = Math.max(0, Math.min(t, d));
    };
    const onLoopToggle = () => {
      setIsLoop(prev => {
        const next = !prev;
        if (audioRef.current) audioRef.current.loop = next;
        return next;
      });
    };
    const onVolumeSet = (e) => {
      const v = e?.detail?.volume;
      if (typeof v === 'number') setVolume(Math.max(0, Math.min(1, v)));
    };
    const onSyncRequest = () => {
      try {
        window.dispatchEvent(new CustomEvent('music:playing', { detail: { playing: isPlaying } }));
        window.dispatchEvent(new CustomEvent('music:time', { detail: { currentTime, duration } }));
        window.dispatchEvent(new CustomEvent('music:loop-state', { detail: { loop: isLoop } }));
        window.dispatchEvent(new CustomEvent('music:volume', { detail: { volume } }));
      } catch {}
    };
    window.addEventListener('music:pause-others', onPauseOthers);
    window.addEventListener('music:globalDisable', onGlobalDisable);
    window.addEventListener('music:play', onPlayCmd);
    window.addEventListener('music:pause', onPauseCmd);
    window.addEventListener('music:seek', onSeekCmd);
    window.addEventListener('music:loop-toggle', onLoopToggle);
    window.addEventListener('music:volume-set', onVolumeSet);
    window.addEventListener('music:sync-request', onSyncRequest);
    return () => {
      window.removeEventListener('music:pause-others', onPauseOthers);
      window.removeEventListener('music:globalDisable', onGlobalDisable);
      window.removeEventListener('music:play', onPlayCmd);
      window.removeEventListener('music:pause', onPauseCmd);
      window.removeEventListener('music:seek', onSeekCmd);
      window.removeEventListener('music:loop-toggle', onLoopToggle);
      window.removeEventListener('music:volume-set', onVolumeSet);
      window.removeEventListener('music:sync-request', onSyncRequest);
    };
  }, [isPlaying, currentTime, duration, isLoop, volume]);

  // 监听全局时间同步（当全屏播放器作为音频源时）
  React.useEffect(() => {
    const onTime = (e) => {
      const d = e?.detail?.duration;
      const t = e?.detail?.currentTime;
      if (typeof d === 'number') setDuration(d);
      if (typeof t === 'number') setCurrentTime(t);
    };
    window.addEventListener('music:time', onTime);
    return () => window.removeEventListener('music:time', onTime);
  }, []);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);
    try { window.dispatchEvent(new CustomEvent('music:time', { detail: { currentTime: t, duration } })); } catch {}
    // 持久化播放进度（包括用于匹配的标识）
    try {
      const s = currentSong || {};
      localStorage.setItem('music:lastProgress', JSON.stringify({
        title: s.title || '',
        artist: s.artist || '',
        musicUrl: s.musicUrl || '',
        time: t,
        updatedAt: Date.now()
      }));
    } catch {}
  };
  
  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration || 0;
    setDuration(d);
    try { window.dispatchEvent(new CustomEvent('music:time', { detail: { currentTime, duration: d } })); } catch {}
    // 加载完成后尝试恢复进度
    try {
      const raw = localStorage.getItem('music:lastProgress');
      if (raw) {
        const lp = JSON.parse(raw);
        const sameByUrl = lp.musicUrl && currentSong?.musicUrl && lp.musicUrl === currentSong.musicUrl;
        const sameByMeta = (lp.title || '').trim() === (currentSong?.title || '').trim() && (lp.artist || '').trim() === (currentSong?.artist || '').trim();
        if ((sameByUrl || sameByMeta) && typeof lp.time === 'number' && isFinite(lp.time)) {
          const t = Math.max(0, Math.min(lp.time, d || lp.time));
          audioRef.current.currentTime = t;
          setCurrentTime(t);
          try { window.dispatchEvent(new CustomEvent('music:time', { detail: { currentTime: t, duration: d } })); } catch {}
        }
      }
    } catch {}
  };

  const formatTime = (t) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 同步音量到 audio
  React.useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // 点击外部关闭音量面板
  React.useEffect(() => {
    const onDocClick = (e) => {
      if (!volOpen) return;
      if (volRef.current && !volRef.current.contains(e.target)) {
        setVolOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [volOpen]);

  // 处理歌曲结束，自动播放下一首
  const handleSongEnd = () => {
    setPlayingState(false);
    if (!isLoop) {
      playNext();
    }
  };

  // 从本地恢复歌词显示状态
  React.useEffect(() => {
    try {
      const v = localStorage.getItem('music:showLyrics');
      if (v === '1') setShowLyrics(true);
      if (v === '0') setShowLyrics(false);
    } catch {}
  }, []);

  // 处理关闭按钮点击
  const handleCollapse = () => {
    setIsCollapsed(true);
    try {
      localStorage.setItem('music:playerCollapsed', 'true');
    } catch {}
  };

  // 处理展开
  const handleExpand = () => {
    setIsCollapsed(false);
    try {
      localStorage.setItem('music:playerCollapsed', 'false');
    } catch {}
  };

  // 如果没有当前歌曲，不显示播放器
  if (!currentSong) {
    return null;
  }

  return (
    <>
      <div
        className={`fixed bottom-4 right-4 z-40 transition-all duration-500 ease-in-out ${
          isCollapsed
            ? 'w-16 h-16 opacity-0 hover:opacity-100'
            : 'w-96 max-w-[90vw] opacity-100'
        } bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-lg rounded-xl overflow-visible sidebar-hover-block`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isCollapsed ? (
          // 折叠状态：显示小图标按钮
          <div
            className="w-full h-full flex items-center justify-center cursor-pointer group"
            onClick={handleExpand}
          >
            <div className="relative">
              <img
                src={currentSong.coverUrl || '/images/default-music-cover.svg'}
                alt={currentSong.title}
                className="w-12 h-12 rounded-lg object-cover transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
              />
              {isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // 展开状态：显示完整播放器
          <>
            {/* 折叠按钮 - 左上角，部分在播放器外 */}
            <button
              className={`absolute -top-2 -left-2 z-50 p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-300 shadow-md ${
                isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
              }`}
              onClick={handleCollapse}
            >
              <X className="w-4 h-4" />
            </button>
            {/* 透明歌词容器（位于迷你播放器上方） */}
            {showLyrics && lyrics.length > 0 && (
              <div className="absolute -top-2 right-0 -translate-y-full w-96 max-w-[90vw] bg-transparent rounded-xl p-2 z-[41]">
                <div
                  ref={lyricsRef}
                  className="max-h-40 overflow-hidden rounded-md p-2 bg-transparent"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {(() => {
                    const len = lyrics.length;
                    const idx = currentLyricIndex;
                    const start = Math.max(0, Math.min(idx < 0 ? 0 : idx - 1, Math.max(0, len - 3)));
                    const items = lyrics.slice(start, Math.min(start + 3, len));
                    return items.map((line, i) => {
                      const realIndex = start + i;
                      const active = realIndex === currentLyricIndex;
                      const passed = realIndex < currentLyricIndex;
                      return (
                        <div
                          key={realIndex}
                          className={`py-1.5 text-center ${active ? 'text-black dark:text-white text-base font-semibold' : passed ? 'text-gray-500 dark:text-gray-300 text-xs' : 'text-gray-800 dark:text-gray-200 text-xs'}`}
                          style={{ lineHeight: 1.5, whiteSpace: 'pre-line' }}
                        >
                          {line.section && (<div className="text-[10px] text-blue-300 mb-0.5">[{line.section}]</div>)}
                          <div>{line.text}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            <div className="relative w-full overflow-hidden rounded-xl">
              <div className="flex items-center p-3 gap-3">
                <img
                  src={currentSong.coverUrl || '/images/default-music-cover.svg'}
                  alt={currentSong.title}
                  className="w-12 h-12 rounded object-cover cursor-pointer"
                  onClick={onOpenFull}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate cursor-pointer" onClick={onOpenFull}>
                    {currentSong.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {currentSong.artist}
                  </div>
                </div>

                <div className="flex items-center gap-1 relative">
                  {/* 上一首按钮 */}
                  <button
                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                    onClick={playPrevious}
                    disabled={playlist.length <= 1}
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  {/* 播放/暂停按钮 */}
                  <button
                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                    onClick={togglePlay}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  {/* 下一首按钮 */}
                  <button
                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                    onClick={playNext}
                    disabled={playlist.length <= 1}
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>

                  {/* 循环播放按钮 */}
                  <button
                    className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ${isLoop ? 'text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}
                    onClick={() => {
                      setIsLoop(v => !v);
                      if (audioRef.current) audioRef.current.loop = !isLoop;
                    }}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  {/* 歌词按钮 */}
                  <button
                    className={`px-2 py-1 rounded text-xs border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700 ${showLyrics ? 'text-white' : 'text-gray-300'}`}
                    onClick={() => {
                      setShowLyrics(v => {
                        const next = !v;
                        try { localStorage.setItem('music:showLyrics', next ? '1' : '0'); } catch {}
                        return next;
                      });
                    }}
                  >
                    词
                  </button>

                  {/* 播放列表按钮 */}
                  <button
                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                    onClick={() => setShowPlaylist(true)}
                  >
                    <ListMusic className="w-4 h-4" />
                  </button>

                  {/* 音量控制 */}
                  <div className="relative" ref={volRef}>
                    <button
                      className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                      onClick={() => setVolOpen(o => !o)}
                    >
                      {volume <= 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    {volOpen && (
                      <div className="absolute -top-2 right-0 -translate-y-full w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-2xl z-[60]">
                        <div className="flex items-center gap-2 mb-2">
                          <button
                            className="p-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
                          >
                            {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                          </button>
                          <div className="text-xs text-gray-600 dark:text-gray-300 select-none">{Math.round(volume * 100)}%</div>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(volume * 100)}
                          onChange={(e) => setVolume(Math.max(0, Math.min(1, Number(e.target.value) / 100)))}
                          className="w-full h-2 rounded-lg appearance-none bg-gray-200 dark:bg-gray-700"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 进度条和时间显示 */}
              <div className="px-3 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 min-w-[30px]">
                    {formatTime(currentTime)}
                  </span>
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden cursor-pointer">
                    <div
                      className="h-full bg-blue-500 transition-all duration-100"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                      onClick={(e) => {
                        if (!audioRef.current || !duration) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const percent = (e.clientX - rect.left) / rect.width;
                        const newTime = Math.max(0, Math.min(duration, percent * duration));
                        audioRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 min-w-[30px] text-right">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
        <audio
          ref={audioRef}
          src={currentSong.musicUrl}
          loop={isLoop}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleSongEnd}
          className="hidden"
        />
      </div>

      {/* 播放列表弹窗 */}
      <MusicPlaylistDialog
        isOpen={showPlaylist}
        onClose={() => setShowPlaylist(false)}
        playlist={playlist}
        currentSongIndex={currentSongIndex}
        isPlaying={isPlaying}
        onSongSelect={playSong}
        onTogglePlay={togglePlay}
        onDeleteSong={(idx) => deleteSongAtIndex(idx)}
      />
    </>
  );
}
