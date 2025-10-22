import React from 'react';
import { SkipBack, SkipForward, ListMusic } from 'lucide-react';
import SvgIcon from './SvgIcon';
import DanmakuComponent from './DanmakuComponent';
import { useMusic } from '@/context/MusicContext';
import MusicPlaylistDialog from './MusicPlaylistDialog';

export default function MusicModal({
  isOpen,
  onClose,
  danmakuText = '好听',
  enableDanmaku = true,
}) {
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [isLoop, setIsLoop] = React.useState(false);
  const [lyrics, setLyrics] = React.useState([]);
  const [currentLyricIndex, setCurrentLyricIndex] = React.useState(-1);
  const [showLyrics, setShowLyrics] = React.useState(true);
  const [volume, setVolume] = React.useState(0.8);
  const [showVol, setShowVol] = React.useState(false);
  const [showPlaylist, setShowPlaylist] = React.useState(false);
  const [layoutMode, setLayoutMode] = React.useState(() => {
    if (typeof window === 'undefined') return 'full';
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width <= 420 || height <= 520) return 'disc';
    if (width <= 640 || height <= 620) return 'info';
    if (width <= 900 || height <= 760) return 'controls';
    return 'full';
  });
  const volRef = React.useRef(null);
  const volTrackRef = React.useRef(null);
  const isDraggingVolRef = React.useRef(false);
  const lyricsContainerRef = React.useRef(null);

  const computeLayoutMode = React.useCallback(() => {
    if (typeof window === 'undefined') return 'full';
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width <= 420 || height <= 520) return 'disc';
    if (width <= 640 || height <= 620) return 'info';
    if (width <= 900 || height <= 760) return 'controls';
    return 'full';
  }, []);

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
  deleteSongAtIndex
  } = useMusic();

  const currentSong = getCurrentSong();

  const timeToSeconds = (timeStr) => {
    const [minutes, seconds] = timeStr.split(':').map(parseFloat);
    return minutes * 60 + seconds;
  };

  // 解析 LRC 文本（与迷你播放器一致）
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

  React.useEffect(() => {
    if (!isOpen || !currentSong) return;
    const tryLocalJson = async (title) => {
      try {
        const r = await fetch(`/ci/${title}.json`);
        if (!r.ok) throw new Error('no local');
        const data = await r.json();
        setLyrics(Array.isArray(data?.lyrics) ? data.lyrics : []);
      } catch {
        setLyrics([]);
      }
    };
    // 优先使用 API 返回的 LRC
    if (currentSong.lyrics && typeof currentSong.lyrics === 'string' && currentSong.lyrics.includes('[')) {
      const parsed = parseLrc(currentSong.lyrics);
      setLyrics(parsed);
    } else if (currentSong.title) {
      tryLocalJson(currentSong.title);
    } else {
      setLyrics([]);
    }
    // 请求当前播放状态，便于 UI 同步
    try { window.dispatchEvent(new CustomEvent('music:sync-request')); } catch {}
  }, [isOpen, currentSong?.title, currentSong?.lyrics, parseLrc]);

  React.useEffect(() => {
    const update = () => setLayoutMode(computeLayoutMode());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [computeLayoutMode]);

  React.useEffect(() => {
    if ((layoutMode === 'disc' || layoutMode === 'info') && showPlaylist) {
      setShowPlaylist(false);
    }
  }, [layoutMode, showPlaylist]);

  // 标记全屏音乐打开，供页面阻止侧栏唤出
  React.useEffect(() => {
    try {
      if (isOpen) document.body.setAttribute('data-music-modal-open', 'true');
      else document.body.removeAttribute('data-music-modal-open');
    } catch {}
    return () => {
      try { document.body.removeAttribute('data-music-modal-open'); } catch {}
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (lyrics.length > 0) {
      let index = -1;
      for (let i = 0; i < lyrics.length; i++) {
        const lyricTime = timeToSeconds(lyrics[i].time);
        if (currentTime >= lyricTime) index = i; else break;
      }
      setCurrentLyricIndex(index);
    }
  }, [currentTime, lyrics]);

  React.useEffect(() => {
    if (currentLyricIndex >= 0 && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current;
      if (currentLyricIndex >= 2) {
        const scrollTop = (currentLyricIndex - 2) * 37;
        container.scrollTo({ top: scrollTop, behavior: 'smooth' });
      } else {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (currentLyricIndex === -1 && lyricsContainerRef.current) {
      lyricsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentLyricIndex]);

  React.useEffect(() => {
    if (!isOpen) {
      setCurrentTime(0);
      setCurrentLyricIndex(-1);
      // 不重置 showLyrics，让其遵循本地持久化
      // 不控制真实音频
    }
  }, [isOpen]);

  // 从本地恢复歌词显示状态
  React.useEffect(() => {
    try {
      const v = localStorage.getItem('music:showLyrics');
      if (v === '1') setShowLyrics(true);
      if (v === '0') setShowLyrics(false);
    } catch {}
  }, []);

  const toggleLoop = () => {
    try { window.dispatchEvent(new CustomEvent('music:loop-toggle')); } catch {}
  };

  const toggleLyrics = () => {
    setShowLyrics((v) => {
      const next = !v;
      try { localStorage.setItem('music:showLyrics', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const handleTimeUpdate = () => {
    // 源在迷你播放器，这里不直接读
  };

  const handleLoadedMetadata = () => {
    // 源在迷你播放器，这里不直接读
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  React.useEffect(() => {
    try { window.dispatchEvent(new CustomEvent('music:volume-set', { detail: { volume } })); } catch {}
  }, [volume]);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // 点击外部关闭音量条
  React.useEffect(() => {
    const onDocClick = (e) => {
      if (!showVol) return;
      if (volRef.current && !volRef.current.contains(e.target)) {
        setShowVol(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showVol]);

  // 监听全局状态（由迷你播放器广播）：播放/时间/循环/音量
  React.useEffect(() => {
    const onPlaying = (e) => {
      const playing = !!(e && e.detail && e.detail.playing);
      setPlayingState(playing);
    };
    const onTime = (e) => {
      const t = e?.detail?.currentTime;
      const d = e?.detail?.duration;
      if (typeof t === 'number') setCurrentTime(t);
      if (typeof d === 'number') setDuration(d);
    };
    const onLoopState = (e) => {
      const loop = e?.detail?.loop;
      if (typeof loop === 'boolean') setIsLoop(loop);
    };
    const onVolume = (e) => {
      const v = e?.detail?.volume;
      if (typeof v === 'number') setVolume(v);
    };
    window.addEventListener('music:playing', onPlaying);
    window.addEventListener('music:time', onTime);
    window.addEventListener('music:loop-state', onLoopState);
    window.addEventListener('music:volume', onVolume);
    return () => {
      window.removeEventListener('music:playing', onPlaying);
      window.removeEventListener('music:time', onTime);
      window.removeEventListener('music:loop-state', onLoopState);
      window.removeEventListener('music:volume', onVolume);
    };
  }, []);

  // 计算弹幕文本：当前句 / 前后句 / 兜底短语
  const getDanmakuText = React.useCallback(() => {
    const phrases = ['好听', '太好听了', '绝了', '单曲循环ing', '有感觉', '❤️', '♪', '好想跟着哼', '入耳即爱'];
    const safeTitle = currentSong?.title || '';
    const safeArtist = currentSong?.artist || '';
    if (safeTitle) phrases.push(`${safeTitle} yyds`);
    if (safeArtist) phrases.push(`${safeArtist} 牛！`);

    if (Array.isArray(lyrics) && lyrics.length > 0) {
      const idx = currentLyricIndex;
      const pick = [];
      if (idx >= 0 && lyrics[idx]?.text) pick.push(lyrics[idx].text);
      if (idx - 1 >= 0 && lyrics[idx - 1]?.text) pick.push(lyrics[idx - 1].text);
      if (idx + 1 < lyrics.length && lyrics[idx + 1]?.text) pick.push(lyrics[idx + 1].text);
      // 用当前句+装饰
      if (idx >= 0 && lyrics[idx]?.text) pick.push(`♪ ${lyrics[idx].text}`);
      const all = [...pick, ...phrases];
      return all[Math.floor(Math.random() * all.length)] || danmakuText;
    }
    return phrases[Math.floor(Math.random() * phrases.length)] || danmakuText;
  }, [lyrics, currentLyricIndex, currentSong?.title, currentSong?.artist, danmakuText]);

  // 垂直音量条：位置->音量
  const setVolumeByClientY = (clientY) => {
    const track = volTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    setVolume(ratio);
  };

  const onVolMouseDown = (e) => {
    isDraggingVolRef.current = true;
    setVolumeByClientY(e.clientY);
    e.preventDefault();
  };
  React.useEffect(() => {
    const onMove = (e) => {
      if (!isDraggingVolRef.current) return;
      setVolumeByClientY(e.clientY);
    };
    const onUp = () => { isDraggingVolRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!isOpen || !currentSong) return null;

  const discSizeMap = {
    disc: 'clamp(10.5rem, 58vw, 18rem)',
    info: 'clamp(10rem, 54vw, 17.5rem)',
    controls: 'clamp(9.8rem, 50vw, 17rem)',
    full: 'clamp(9.2rem, 46vw, 16rem)',
  };
  const ringThicknessMap = {
    disc: { outer: 'clamp(0.75rem, 3.5vw, 1.2rem)', inner: 'clamp(0.55rem, 2.8vw, 0.9rem)' },
    info: { outer: 'clamp(0.7rem, 3.2vw, 1.1rem)', inner: 'clamp(0.5rem, 2.5vw, 0.85rem)' },
    controls: { outer: 'clamp(0.65rem, 3vw, 1.05rem)', inner: 'clamp(0.45rem, 2.2vw, 0.8rem)' },
    full: { outer: 'clamp(0.6rem, 2.8vw, 1rem)', inner: 'clamp(0.4rem, 2vw, 0.75rem)' },
  };
  const discSize = discSizeMap[layoutMode] || discSizeMap.full;
  const { outer: outerRingThickness, inner: innerRingThickness } = ringThicknessMap[layoutMode] || ringThicknessMap.full;
  const centerButtonSize = 'clamp(2.5rem, 10vw, 3.4rem)';
  const showSongInfo = layoutMode !== 'disc';
  const showControlRow = layoutMode === 'controls' || layoutMode === 'full';
  const showLyricsSection = layoutMode === 'full' && showLyrics && lyrics.length > 0;
  const canToggleLyrics = layoutMode === 'full';

  return (
    <>
      {enableDanmaku && (
        <DanmakuComponent
          isVisible={isOpen}
          getText={getDanmakuText}
          opacity={0.7}
          speed={3}
          isLoop={true}
          maxLines={8}
          screenRatio={0.5}
          interval={800}
          fontSize={18}
          color="#ffffff"
          density={3}
          randomHeight
          randomSpeed
          randomSize
          zIndex={45}
        />
      )}
      <div className="fixed inset-0 bg-[rgba(0,0,0,0.3)] bg-opacity-75 flex items-center justify-center z-50 transition-opacity duration-300 ease-in-out font-[family-name:var(--font-geist-sans)] px-4 sm:px-6" onClick={onClose}>
        <div
          className="bg-[#282A2A] rounded-2xl w-full max-w-2xl mx-auto px-5 py-6 sm:px-8 sm:py-8 transform transition-all duration-300 ease-in-out relative flex flex-col items-center gap-4 sm:gap-5 pt-10 sm:pt-14 pb-4"
          style={{ animation: isOpen ? 'modalSlideIn 0.3s ease-out' : 'modalSlideOut 0.3s ease-in', width: 'min(92vw, 36rem)', maxHeight: 'min(90vh, 42rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} className="cursor-pointer absolute top-4 right-4">
            <SvgIcon name="close" width={30} height={30} color="#333" />
          </button>

          <div
            className="text-center bg-[#3C3E3F] rounded-full relative flex items-center justify-center shadow-lg mx-auto box-border"
            style={{ width: discSize, height: discSize, padding: outerRingThickness }}
          >
            <div
              className="bg-[#030303] rounded-full overflow-hidden shadow-lg flex items-center justify-center relative w-full h-full box-border"
              style={{ padding: innerRingThickness }}
            >
              <img
                src={currentSong.coverUrl || '/images/default-music-cover.svg'}
                alt={currentSong.title}
                className={`object-cover rounded-full border-[3px] border-white transition-transform duration-1000 w-full h-full ${isPlaying ? 'animate-spin' : ''}`}
                style={{ animationDuration: '10s' }}
              />

              {/* 唱片中央播放/暂停按钮 */}
              {!isPlaying && (
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer bg-[rgba(0,0,0,0.5)] rounded-full flex items-center justify-center"
                  style={{ width: centerButtonSize, height: centerButtonSize }}
                  onClick={togglePlay}
                >
                  <SvgIcon name="play" color="#fff" className="w-full h-full" />
                </div>
              )}

              {isPlaying && (
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer bg-[rgba(0,0,0,0.5)] rounded-full flex items-center justify-center"
                  style={{ width: centerButtonSize, height: centerButtonSize }}
                  onClick={togglePlay}
                >
                  <SvgIcon name="pause" color="#fff" className="w-full h-full" />
                </div>
              )}
            </div>
          </div>

          {showSongInfo && (
            <>
              <div className="text-lg sm:text-xl text-white mt-2 text-center px-2 break-words">{currentSong.title}</div>
              <p className="text-sm sm:text-base text-gray-300 text-center px-2">{currentSong.artist}</p>
            </>
          )}

          {showControlRow && (
          <div className="w-full flex flex-col items-center gap-2 mb-2">
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5">
              {/* 上一首按钮 */}
              <button
                onClick={playPrevious}
                className="cursor-pointer text-white hover:text-gray-300 transition-colors disabled:opacity-40"
                title="上一首"
                disabled={playlist.length <= 1}
              >
                <SkipBack className="w-5 h-5" />
              </button>

              {/* 播放/暂停按钮 */}
              <div onClick={togglePlay} className="cursor-pointer">
                {isPlaying ? (
                  <SvgIcon name="pause" width={20} height={20} color="#fff" />
                ) : (
                  <SvgIcon name="play" width={20} height={20} color="#fff" />
                )}
              </div>

              {/* 下一首按钮 */}
              <button
                onClick={playNext}
                className="cursor-pointer text-white hover:text-gray-300 transition-colors"
                title="下一首"
                disabled={playlist.length <= 1}
              >
                <SkipForward className="w-5 h-5" />
              </button>

              {/* 循环播放按钮 */}
              {!isLoop ? (
                <div onClick={toggleLoop}>
                  <SvgIcon name="pepicons" width={20} height={20} color="#fff" className="cursor-pointer" />
                </div>
              ) : (
                <div onClick={toggleLoop}>
                  <SvgIcon name="no-pepicons" width={20} height={20} color="#fff" className="cursor-pointer" />
                </div>
              )}

              {/* 歌词按钮 */}
              {canToggleLyrics && (
                <span 
                  className={`cursor-pointer text-white text-xs sm:text-sm ${showLyrics ? 'font-semibold' : 'font-normal'}`}
                  onClick={toggleLyrics}
                >
                  词
                </span>
              )}

              {/* 播放列表按钮 */}
              <button
                onClick={() => setShowPlaylist(true)}
                className="cursor-pointer text-white hover:text-gray-300 transition-colors"
                title="播放列表"
              >
                <ListMusic className="w-5 h-5" />
              </button>

              {/* 音量控制 */}
              <div
                className="relative flex items-center"
                ref={volRef}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.05 : 0.05;
                  setVolume(v => clamp(v + delta, 0, 1));
                }}
              >
                <button
                  className="cursor-pointer text-white text-sm px-2 py-1 rounded hover:bg-[#4a4c4d]"
                  title={volume > 0 ? '静音' : '取消静音'}
                  onClick={() => setVolume(v => (v > 0 ? 0 : 0.8))}
                  onMouseEnter={() => setShowVol(true)}
                >
                  {volume > 0 ? '🔊' : '🔇'}
                </button>
                {showVol && (
                  <div
                    className="absolute bottom-9 left-1/2 -translate-x-1/2 bg-[#2f3132] border border-gray-700 rounded-xl px-3 py-3 shadow-2xl z-50"
                    onMouseLeave={() => setShowVol(false)}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-[11px] text-gray-300 select-none">{Math.round(volume * 100)}%</div>
                      <div
                        ref={volTrackRef}
                        className="relative w-2 h-28 rounded-full bg-gray-700 cursor-pointer"
                        onMouseDown={onVolMouseDown}
                        onClick={(e) => setVolumeByClientY(e.clientY)}
                      >
                        <div
                          className="absolute bottom-0 left-0 w-full bg-white rounded-full"
                          style={{ height: `${Math.round(volume * 100)}%` }}
                        />
                        <div
                          className="absolute left-1/2 -translate-x-1/2 rounded-full w-4 h-4 bg-white shadow"
                          style={{ bottom: `calc(${Math.round(volume * 100)}% - 0.5rem)` }}
                          onMouseDown={onVolMouseDown}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <span className="text-white text-xs sm:text-sm text-center leading-tight">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          )}

          {/* 歌词（放入卡片内） */}
          {showLyricsSection && (
            <div className="w-full mt-2">
              <div
                ref={lyricsContainerRef}
                className="rounded-lg px-3 py-2 overflow-y-auto scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', maxHeight: 'min(32vh, 13rem)' }}
              >
                {(() => {
                  const len = lyrics.length;
                  const idx = currentLyricIndex;
                  const start = Math.max(0, Math.min(idx < 0 ? 0 : idx - 1, Math.max(0, len - 3)));
                  const items = lyrics.slice(start, Math.min(start + 3, len));
                  return items.map((lyric, i) => {
                    const realIndex = start + i;
                    const isCurrentLyric = realIndex === currentLyricIndex;
                    const isPassedLyric = realIndex < currentLyricIndex;
                    return (
                      <div
                        key={realIndex}
                className={`py-1.5 px-2 transition-all duration-300 text-center ${isCurrentLyric ? 'text-white text-base sm:text-xl font-bold' : isPassedLyric ? 'text-gray-300 text-xs sm:text-sm' : 'text-gray-200 text-xs sm:text-sm'}`}
                        style={{ lineHeight: '1.6', whiteSpace: 'pre-line' }}
                      >
                        {lyric.artist && (<div className="text-[10px] sm:text-xs text-gray-400 mb-1">{lyric.artist}</div>)}
                        {lyric.section && (<div className="text-[10px] sm:text-xs text-blue-300 mb-1 font-semibold">[{lyric.section}]</div>)}
                        <div>{lyric.text}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* 无音频元素：音频源在迷你播放器 */}
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

        <style>{`
          @keyframes modalSlideIn { from { opacity: 0; transform: scale(0.9) translateY(-20px);} to { opacity: 1; transform: scale(1) translateY(0);} }
          @keyframes modalSlideOut { from { opacity: 1; transform: scale(1) translateY(0);} to { opacity: 0; transform: scale(0.9) translateY(-20px);} }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
        `}</style>
      </div>
    </>
  );
}

// 无音频元素，作为全局音频（迷你播放器）的控制与展示层
