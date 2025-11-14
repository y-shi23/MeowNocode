import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Mic, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { useSettings } from '@/context/SettingsContext';
import { EMOJI_CATEGORIES, loadEmojiItems, buildEmojiUrl } from '@/config/emoji';
import { getEmojiCategory } from '@/config/emoji';
import fileStorageService from '@/lib/fileStorageService';
import AudioWaveform from '@/components/AudioWaveform';

const MemoEditor = ({
  value = '',
  onChange,
  placeholder = 'Write something...',
  onSubmit,
  disabled = false,
  maxLength,
  showCharCount = false,
  autoFocus = false,
  className = '',
  // backlinks related
  memosList = [],
  currentMemoId = null,
  backlinks = [],
  onAddBacklink,
  onRemoveBacklink,
  onPreviewMemo,
  // optional focus callbacks
  onFocus,
  onBlur,
  // audio: callback to attach a recorded audio clip to memo
  onAddAudioClip,
  audioClips = [],
  onRemoveAudioClip,
}) => {
  // theme & settings
  const { themeColor } = useTheme();
  const { fontConfig, hitokotoConfig } = useSettings();
  const currentFont = fontConfig?.selectedFont || 'default';

  // local states / refs
  const textareaRef = useRef(null);
  const rootRef = useRef(null);
  const collapsedHeightRef = useRef(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [compositionValue, setCompositionValue] = useState('');
  const [hitokoto, setHitokoto] = useState({ text: '' });
  const [showBacklinkPicker, setShowBacklinkPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState(null);
  const backlinkBtnRef = useRef(null);
  // emoji picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerPos, setEmojiPickerPos] = useState(null);
  const emojiBtnRef = useRef(null);
  const [activeEmojiCategory, setActiveEmojiCategory] = useState(EMOJI_CATEGORIES[0]?.key || 'bili');
  const [emojiMap, setEmojiMap] = useState({});
  const emojiPanelRef = useRef(null); // { categoryKey: [{name, file}] }

  // Audio recording state and waveform
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [recordStartAt, setRecordStartAt] = useState(null);
  const [accumulatedMs, setAccumulatedMs] = useState(0);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const rafRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const [durationTick, setDurationTick] = useState(0);
  const editorAudioRefs = useRef({});
  const [editorPlaying, setEditorPlaying] = useState({});
  const [editorClipUrls, setEditorClipUrls] = useState({});

  // 获取一言或内置句子
  const fetchHitokoto = async () => {
    if (!hitokotoConfig.enabled) {
      // 从内置句子中随机选择
      const builtInSentences = [
        'Stay hungry, stay foolish. - Steve Jobs',
        'Life is what happens when you\'re busy making other plans. - John Lennon',
        'The best preparation for tomorrow is doing your best today.',
        'The journey of a thousand miles begins with one step.',
        'Carpe diem. Seize the day.',
        'In three words I can sum up everything I\'ve learned about life: it goes on.',
        'You miss 100% of the shots you don\'t take.',
        'Simplicity is the ultimate sophistication.'
      ];
      const randomIndex = Math.floor(Math.random() * builtInSentences.length);
      setHitokoto({
        text: builtInSentences[randomIndex],
      });
      return;
    }

    try {
      // 构建请求URL，包含类型参数
      const typeParams = hitokotoConfig.types.map(type => `c=${type}`).join('&');
      const url = `https://v1.hitokoto.cn/?${typeParams}`;

      const response = await fetch(url);
      const data = await response.json();
      setHitokoto({
        text: data.hitokoto,
      });
    } catch (error) {
      console.error('获取一言失败:', error);
      // API失败时使用内置句子
      const builtInSentences = [
        'Stay hungry, stay foolish. - Steve Jobs',
        'Life is what happens when you\'re busy making other plans. - John Lennon',
        'The best preparation for tomorrow is doing your best today.',
        'The journey of a thousand miles begins with one step.',
        'Carpe diem. Seize the day.',
        'In three words I can sum up everything I\'ve learned about life: it goes on.',
        'You miss 100% of the shots you don\'t take.',
        'Simplicity is the ultimate sophistication.'
      ];
      const randomIndex = Math.floor(Math.random() * builtInSentences.length);
      setHitokoto({
        text: builtInSentences[randomIndex],
      });
    }
  };

  const measureCollapsedHeight = useCallback(() => {
    if (typeof window === 'undefined' || !textareaRef.current) {
      return collapsedHeightRef.current || 72;
    }
    const textarea = textareaRef.current;
    const styles = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(styles.lineHeight || '24') || 24;
    const paddingTop = parseFloat(styles.paddingTop || '12') || 12;
    const paddingBottom = parseFloat(styles.paddingBottom || '12') || 12;
    const borderTop = parseFloat(styles.borderTopWidth || '0') || 0;
    const borderBottom = parseFloat(styles.borderBottomWidth || '0') || 0;
    const collapsed = lineHeight * 2 + paddingTop + paddingBottom + borderTop + borderBottom;
    collapsedHeightRef.current = collapsed;
    return collapsed;
  }, [fontConfig?.fontSize, currentFont]);

  // 自动调整高度
  const adjustHeight = useCallback((forceFocusState) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 0);

    const applyHeight = (target) => {
      schedule(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = `${target}px`;
        }
      });
    };

    const shouldExpand = typeof forceFocusState === 'boolean' ? forceFocusState : isFocused;
    if (!shouldExpand) {
      const collapsed = measureCollapsedHeight();
      applyHeight(collapsed);
      return;
    }

    const previousHeight = textarea.style.height;
    textarea.style.height = 'auto';
    const newHeight = Math.max(120, Math.min(400, textarea.scrollHeight));
    textarea.style.height = previousHeight;
    applyHeight(newHeight);
  }, [isFocused, measureCollapsedHeight]);

  // 处理输入变化
  const handleChange = (e) => {
    const newValue = e.target.value;
    onChange?.(newValue);
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 0);
    schedule(() => adjustHeight(true));
  };

  // 处理输入法合成开关
  const handleCompositionStart = (e) => {
    setIsComposing(true);
    setCompositionValue(e.target.value);
  };

  // 处理输入法合成更新
  const handleCompositionUpdate = (e) => {
    if (isComposing) {
      setCompositionValue(e.target.value);
    }
  };

  // 处理输入法合成结束
  const handleCompositionEnd = (e) => {
    setIsComposing(false);
    setCompositionValue('');
    const newValue = e.target.value;
    onChange?.(newValue);
  };

  // 处理键盘事件
  const handleKeyDown = (e) => {
    // Ctrl+Enter 或 Cmd+Enter 提交
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
      return;
    }
  };

  // 在光标处插入 spoiler 语法，并将光标定位到 spoiler 内容后
  const insertSpoilerAtCursor = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    // 形如: {% spoiler  %}，光标定位到 spoiler 后的空白处（两空格中间的第一个后面）
    const snippet = '{% spoiler  %}';
    // 计算插入后光标位置：位于 "{% spoiler " 之后（索引从0开始）
    const caretOffsetInSnippet = '{% spoiler '.length; // 包含末尾空格，落在内容位置前
    const newValue = before + snippet + after;
    onChange?.(newValue);
    // 聚焦并设置选择区域到内容位置前
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = start + caretOffsetInSnippet;
        try { textareaRef.current.setSelectionRange(pos, pos); } catch {}
      }
      // 调整高度
      adjustHeight();
    }, 0);
  };

  // 选择一个目标 memo 建立双链
  const handlePickBacklink = (targetId) => {
    if (!onAddBacklink) return;
    if (currentMemoId && targetId === currentMemoId) return;
    onAddBacklink(currentMemoId || null, targetId);
    setShowBacklinkPicker(false);
  };

  // Insert arbitrary snippet at cursor position
  const insertSnippetAtCursor = (snippet, caretOffsetFromStart = snippet.length) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const newValue = before + snippet + after;
    onChange?.(newValue);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = start + (caretOffsetFromStart ?? snippet.length);
        try { textareaRef.current.setSelectionRange(pos, pos); } catch {}
      }
      adjustHeight();
    }, 0);
  };

  const insertEmojiSyntax = (categoryKey, name) => {
    const snippet = `:${categoryKey}_${name}:`;
    insertSnippetAtCursor(snippet, snippet.length);
  };

  // Render inline text with :cat_name: emoji shortcodes as <img> nodes
  const renderInlineWithEmoji = (text) => {
    if (!text) return null;
    const EMOJI_RE = /:([a-z0-9]+)_([a-z0-9_\-]+):/gi;
    const nodes = [];
    let lastIndex = 0;
    let m;
    let k = 0;
    while ((m = EMOJI_RE.exec(text)) !== null) {
      if (m.index > lastIndex) {
        nodes.push(text.slice(lastIndex, m.index));
      }
      const cat = (m[1] || '').toLowerCase();
      const name = (m[2] || '').toLowerCase();
      if (getEmojiCategory(cat)) {
        const url = buildEmojiUrl(cat, name, 'png');
        nodes.push(
          <img
            key={`emoji-${k++}-${cat}-${name}`}
            src={url}
            alt={`emoji:${cat}_${name}`}
            className="inline-block transition-transform duration-150 ease-out"
            style={{ height: '1em', width: 'auto', objectFit: 'contain', verticalAlign: '-0.2em', margin: '0 0.05em' }}
            loading="lazy"
            onError={(e) => {
              const order = ['png', 'webp', 'gif'];
              const curExt = (e.currentTarget.src.match(/\.(\w+)(?:\?|#|$)/) || [,''])[1];
              const rest = order.filter(x => x !== curExt);
              for (const ext of rest) {
                const candidate = buildEmojiUrl(cat, name, ext);
                if (e.currentTarget.src !== candidate) {
                  e.currentTarget.src = candidate;
                  return;
                }
              }
            }}
          />
        );
      } else {
        nodes.push(m[0]);
      }
      lastIndex = m.index + m[0].length;
    }
    const rest = text.slice(lastIndex);
    if (rest) nodes.push(rest);
    return nodes;
  };

  // --- Audio waveform drawing helpers ---
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    if (!canvas || !analyser || !dataArray) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    analyser.getByteTimeDomainData(dataArray);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    const sliceWidth = width / dataArray.length;
    let x = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
    rafRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const setupWaveform = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
      drawWaveform();
    } catch (e) {
      console.warn('Waveform setup failed:', e);
    }
  };

  const cleanupRecording = () => {
    try { cancelAnimationFrame(rafRef.current); } catch {}
    rafRef.current = null;
    try { audioCtxRef.current && audioCtxRef.current.close(); } catch {}
    audioCtxRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        try { track.stop(); } catch {}
      }
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setRecordStartAt(null);
    setAccumulatedMs(0);
    setIsPaused(false);
  };

  const formatMs = (ms) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const currentDurationMs = (() => {
    if (!recordStartAt) return accumulatedMs;
    return accumulatedMs + (isPaused ? 0 : (Date.now() - recordStartAt));
  })();

  const handleRecordClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMicPermission(true);
        mediaStreamRef.current = stream;
        setupWaveform(stream);
        const mimeTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/ogg'
        ];
        let selectedType = '';
        for (const mt of mimeTypes) {
          if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mt)) {
            selectedType = mt; break;
          }
        }
        const mr = new MediaRecorder(stream, selectedType ? { mimeType: selectedType } : undefined);
        audioChunksRef.current = [];
        mr.ondataavailable = (evt) => {
          if (evt.data && evt.data.size > 0) audioChunksRef.current.push(evt.data);
        };
        mr.onstop = async () => {
          try {
            const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
            const ext = (blob.type && blob.type.split('/')[1]) || 'webm';
            const file = new File([blob], `memo_record_${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
            const durationMs = currentDurationMs;
            try {
              try { fileStorageService.init((JSON.parse(localStorage.getItem('s3Config')||'{}'))); } catch {}
              const meta = await fileStorageService.processFile(file, { type: 'audio' });
              const clip = { ...meta, durationMs, createdAt: new Date().toISOString(), previewUrl: URL.createObjectURL(blob) };
              onAddAudioClip?.(currentMemoId || null, clip);
            } catch (err) {
              console.error('Store audio failed:', err);
            }
          } finally {
            cleanupRecording();
            setIsRecording(false);
          }
        };
        mediaRecorderRef.current = mr;
        mr.start();
        setIsRecording(true);
        setIsPaused(false);
        setRecordStartAt(Date.now());
      } catch (err) {
        console.error('getUserMedia failed:', err);
        setHasMicPermission(false);
        try { await navigator.mediaDevices.getUserMedia({ audio: true }); setHasMicPermission(true); } catch {}
      }
    } else {
      try { mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive' && mediaRecorderRef.current.stop(); } catch {}
    }
  };

  const handlePauseResume = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (!isPaused) {
      try { mr.pause(); } catch {}
      if (recordStartAt) setAccumulatedMs(prev => prev + (Date.now() - recordStartAt));
      setRecordStartAt(null);
      setIsPaused(true);
    } else {
      try { mr.resume(); } catch {}
      setRecordStartAt(Date.now());
      setIsPaused(false);
    }
  };

  // editor-level audio controls
  const handleEditorTogglePlay = (idx) => {
    const key = String(idx);
    const el = editorAudioRefs.current[key];
    if (!el) return;
    if (el.paused) {
      el.play();
      setEditorPlaying((p) => ({ ...p, [key]: true }));
    } else {
      el.pause();
      setEditorPlaying((p) => ({ ...p, [key]: false }));
    }
  };

  const ensureEmojiCategoryLoaded = async (categoryKey) => {
    if ((emojiMap[categoryKey] || []).length > 0) return;
    const items = await loadEmojiItems(categoryKey);
    setEmojiMap((m) => ({ ...m, [categoryKey]: items }));
  };

  // resolve editor clip urls for indexeddb/base64
  useEffect(() => {
    const resolve = async () => {
      try {
        const next = {};
        const clips = Array.isArray(audioClips) ? audioClips : [];
        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i];
          if (!clip) continue;
          const key = String(i);
          if (clip.previewUrl || clip.url || clip.data) {
            next[key] = clip.previewUrl || clip.url || clip.data;
          } else if (clip.storageType === 'indexeddb' && clip.id) {
            try {
              const restored = await fileStorageService.restoreFile(clip);
              if (restored && restored.data) next[key] = restored.data;
            } catch {}
          }
        }
        setEditorClipUrls(next);
      } catch {}
    };
    resolve();
  }, [JSON.stringify(typeof audioClips === 'object' ? audioClips : [])]);

  // 计算选择卡片的屏幕定位，避免被滚动容器裁剪
  const updatePickerPosition = useCallback(() => {
    const btn = backlinkBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = 320;
    const margin = 8;
    let left = Math.min(rect.left, window.innerWidth - width - margin);
    if (left < margin) left = margin;
    const top = Math.min(rect.bottom + 6, window.innerHeight - margin);
    setPickerPos({ left, top, width });
  }, []);

  const updateEmojiPickerPosition = useCallback(() => {
    const btn = emojiBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = 420;
    const margin = 8;
    let left = Math.min(rect.left, window.innerWidth - width - margin);
    if (left < margin) left = margin;
    const top = Math.min(rect.bottom + 6, window.innerHeight - margin);
    setEmojiPickerPos({ left, top, width });
  }, []);

  useEffect(() => {
    if (!showBacklinkPicker) return;
    updatePickerPosition();
    const onResize = () => updatePickerPosition();
    const onScroll = () => updatePickerPosition();
    window.addEventListener('resize', onResize);
    // 捕获阶段监听滚动，包含内部滚动容器
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [showBacklinkPicker, updatePickerPosition]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    updateEmojiPickerPosition();
    const onResize = () => updateEmojiPickerPosition();
    const onScroll = () => updateEmojiPickerPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [showEmojiPicker, updateEmojiPickerPosition]);
  // Close emoji panel when clicking anywhere outside the panel or editor controls (except the emoji button itself)
  useEffect(() => {
    if (!showEmojiPicker) return;
    const onDocMouseDown = (e) => {
      const panel = emojiPanelRef.current;
      const btn = emojiBtnRef.current;
      if (panel && panel.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [showEmojiPicker]);

  const findMemoById = (id) => memosList.find(m => m.id === id);
  const backlinkMemos = (backlinks || []).map(findMemoById).filter(Boolean);

  // 焦点事件
  const handleFocus = () => {
    setIsFocused(true);
    adjustHeight(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    // 失去焦点时关闭选择器
    setShowBacklinkPicker(false);
    setShowEmojiPicker(false);
    adjustHeight(false);
    onBlur?.();
  };

  // 在编辑器聚焦时，点击编辑器区域任意位置（不含双链按钮/选择器）关闭选择器
  const handleContainerMouseDown = () => {
    if (showBacklinkPicker) {
      setShowBacklinkPicker(false);
    }
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
    }
  };

  // 当value或状态变化时调整高度
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // 组件挂载时获取一言，以及当一言配置变化时重新获取
  useEffect(() => {
    fetchHitokoto();
  }, [hitokotoConfig]);

  // duration ticker while recording to update UI
  useEffect(() => {
    if (isRecording && !isPaused) {
      const id = setInterval(() => setDurationTick((t) => t + 1), 200);
      return () => clearInterval(id);
    }
  }, [isRecording, isPaused]);

  // cleanup on unmount
  useEffect(() => () => cleanupRecording(), []);

  // 计算字符数 - 在输入法合成期间使用合成前的字符数
  const getDisplayCharCount = () => {
    if (isComposing && compositionValue) {
      // 输入法合成期间，使用合成开始前的字符数
      return compositionValue.length;
    }
    return value.length;
  };

  const charCount = getDisplayCharCount();
  const isNearLimit = maxLength && charCount > maxLength * 0.8;
  const isOverLimit = maxLength && charCount > maxLength;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative border rounded-lg overflow-hidden bg-white dark:bg-gray-800 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isFocused
          ? "ring-2 shadow-sm"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      style={isFocused ? {
        borderColor: themeColor,
        '--tw-ring-color': themeColor
      } : {}}
      onMouseDown={handleContainerMouseDown}
    >
      {/* 主要文本区域 */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionUpdate={handleCompositionUpdate}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          "w-full p-3 bg-transparent resize-none outline-none border-none theme-selection",
          "text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500",
          "custom-font-content scrollbar-theme scrollbar-track-transparent",
          disabled && "cursor-not-allowed"
        )}
        style={{
          maxHeight: '400px',
          lineHeight: '1.5rem',
          fontSize: (fontConfig?.fontSize ? `${fontConfig.fontSize}px` : undefined),
          transition: 'height 280ms cubic-bezier(0.22, 1, 0.36, 1)',
          overflow: isFocused ? 'auto' : 'hidden',
          ...(currentFont === 'default' && {
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
          })
        }}
        rows={isFocused ? 5 : 2}
      />

      {/* 反链 Chips（编辑时显示） */}
      {isFocused && backlinkMemos.length > 0 && (
        <div className="px-3 pb-1 -mt-2 flex flex-wrap gap-2">
          {backlinkMemos.map((m) => (
            <span key={m.id} className="inline-flex items-center group">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onPreviewMemo?.(m.id); }}
                className="max-w-full inline-flex items-center gap-1 pl-2 pr-2 py-0.5 rounded-md bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <span className="truncate inline-flex items-center max-w-[180px]">
                  {renderInlineWithEmoji(m.content?.replace(/\n/g, ' ').slice(0, 50) || '暂无内容')}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
              </button>
              <button
                type="button"
                aria-label="移除反链"
                className="ml-1 w-4 h-4 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveBacklink?.(currentMemoId || null, m.id); }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 音频 Chips（编辑时显示） */}
      {isFocused && Array.isArray(audioClips) && audioClips.length > 0 && (
        <div className="px-3 pb-1 -mt-1 flex flex-wrap gap-2">
          {audioClips.map((clip, idx) => {
            const key = String(idx);
            const src = editorClipUrls[key] || clip?.previewUrl || clip?.url || clip?.data || '';
            const isPlaying = !!editorPlaying[key];
            return (
              <span key={`clip-${idx}`} className="inline-flex items-center group">
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleEditorTogglePlay(idx); }}
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
                  <span className="truncate inline-flex items-center max-w-[180px]">录音 {clip?.durationMs ? `· ${formatMs(clip.durationMs)}` : ''}</span>
                </button>
                <audio
                  ref={(el) => { if (el) editorAudioRefs.current[key] = el; }}
                  src={src}
                  style={{ display: 'none' }}
                  onEnded={() => setEditorPlaying((p) => ({ ...p, [key]: false }))}
                />
                <button
                  type="button"
                  aria-label="移除录音"
                  className="ml-1 w-4 h-4 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveAudioClip?.(currentMemoId || null, idx); }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* 底部信息栏 */}
      {(showCharCount || onSubmit) && (
        <div className="flex items-center justify-between px-3 py-1 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 min-h-[32px] rounded-b-lg">
          {/* 未聚焦时显示一言 */}
              {!(isFocused || isRecording) && hitokotoConfig.enabled ? (
                <a
                  className={cn(
                    "flex-1 text-center text-xs text-gray-500 truncate px-2 transition-colors duration-300",
                    currentFont !== 'default' && "custom-font-content"
                  )}
                  style={{
                    '--hover-color': 'var(--theme-color)',
                  }}
                  onMouseEnter={(e) => e.target.style.color = 'var(--theme-color)'}
                  onMouseLeave={(e) => e.target.style.color = ''}
                >
                  {hitokoto.text}
            </a>
          ) : !(isFocused || isRecording) && !hitokotoConfig.enabled ? (
            <div className="flex-1"></div>
          ) : (isFocused || isRecording) ? (
            <>
              {/* 左侧：字数+ 插入spoiler按钮 */}
              <div className="flex items-center gap-2 relative">
                {showCharCount && (
                  <div className={cn(
                    "text-xs transition-colors",
                    isOverLimit
                      ? "text-red-500 font-medium"
                      : isNearLimit
                        ? "text-orange-500"
                        : "text-gray-500 dark:text-gray-400"
                  )}>
                    {charCount} 字
                  </div>
                )}
                {/* Spoiler 快捷按钮 */}
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); /* 允许冒泡以便父容器关闭选择器*/ insertSpoilerAtCursor(); }}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-600 bg-white hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                  {/* 模糊的小圆角矩形图标（默认模糊效果） */}
                  <svg width="16" height="12" viewBox="0 0 18 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <filter id="f" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="1.1" />
                      </filter>
                    </defs>
                    <rect x="2" y="2" width="14" height="8" rx="3" fill="currentColor" opacity="0.9" filter="url(#f)" />
                  </svg>
                </button>

                {/* 双链按钮 */}
                <button
                  type="button"
                  ref={backlinkBtnRef}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const willShow = !showBacklinkPicker;
                    setShowBacklinkPicker(willShow);
                    if (willShow) {
                      setShowEmojiPicker(false);
                      updatePickerPosition();
                    }
                  }}
                  className={cn(
                    "inline-flex items-center justify-center h-7 px-2 rounded-md text-gray-600 bg-white hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                  )}
                >
                  {/* 简洁链路图标 */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 14a5 5 0 0 1 0-7.07l1.94-1.94a5 5 0 0 1 7.07 7.07l-1.25 1.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M14 10a5 5 0 0 1 0 7.07l-1.94 1.94a5 5 0 0 1-7.07-7.07l1.25-1.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>

                {/* Emoji 表情按钮 */}
                <button
                  type="button"
                  ref={emojiBtnRef}
                  onMouseDown={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const willShow = !showEmojiPicker;
                    setShowEmojiPicker(willShow);
                    if (willShow) {
                      setShowBacklinkPicker(false);
                      updateEmojiPickerPosition();
                      await ensureEmojiCategoryLoaded(activeEmojiCategory);
                    }
                  }}
                  className={cn(
                    "inline-flex items-center justify-center h-7 px-2 rounded-md text-gray-600 bg-white hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                  )}
                  title="插入表情"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="9" cy="10" r="1" fill="currentColor" />
                    <circle cx="15" cy="10" r="1" fill="currentColor" />
                    <path d="M8.5 14c1 1.2 2.5 2 3.5 2s2.5-.8 3.5-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>

                {/* 录音按钮 */}
                <button
                  type="button"
                  onMouseDown={handleRecordClick}
                  className={cn(
                    "inline-flex items-center justify-center h-7 w-7 rounded-md bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors",
                    isRecording ? "ring-2 ring-red-500" : ""
                  )}
                  title={isRecording ? "停止录音" : (hasMicPermission ? "开始录音" : "申请麦克风权限并开始录音")}
                >
                  {isRecording ? (
                    <div className="w-3.5 h-2.5 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
                  ) : (
                    <Mic className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  )}
                </button>

                {/* 波纹与暂停控制 */}
                {isRecording && (
                  <div className="ml-2 flex items-center gap-2 select-none" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    <AudioWaveform
                      stream={mediaStreamRef.current}
                      width={90}
                      height={20}
                      className="rounded bg-gray-100 dark:bg-gray-700"
                      style={{ display: 'block' }}
                    />
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 min-w-[36px] text-right">{formatMs(currentDurationMs)}</div>
                    <button
                      type="button"
                      onMouseDown={handlePauseResume}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
                      title={isPaused ? "继续录音" : "暂停录音"}
                    >
                      {isPaused ? (
                        <Play className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                      ) : (
                        <Pause className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                      )}
                    </button>
                  </div>
                )}

                {/* 双链选择卡片 */}
                {isFocused && showBacklinkPicker && (
                  <div
                    className="fixed z-50 w-[320px] max-h-56 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
                    style={{ left: pickerPos?.left ?? 16, top: pickerPos?.top ?? 100, width: pickerPos?.width ?? 320 }}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  >
                    <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">选择一篇Memo 建立双链</div>
                    <div className="overflow-y-auto pr-2 scrollbar-transparent" style={{ maxHeight: '11rem' }}>
                      {(memosList || [])
                        .filter(m => m.id !== currentMemoId)
                        .filter(m => !(Array.isArray(backlinks) && backlinks.includes(m.id)))
                        .slice(0, 50)
                        .map(m => (
                        <button
                          key={m.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handlePickBacklink(m.id); }}
                             
                        >
                          <div className="truncate whitespace-nowrap overflow-hidden text-ellipsis">
                            {renderInlineWithEmoji((m.content?.replace(/\n/g, ' ') || '暂无内容'))}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">{new Date(m.updatedAt || m.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric' })}</div>
                        </button>
                      ))}
                      {(memosList || [])
                        .filter(m => m.id !== currentMemoId)
                        .filter(m => !(Array.isArray(backlinks) && backlinks.includes(m.id)))
                        .length === 0 && (
                        <div className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">暂无可选Memo</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Emoji 选择卡片 */}
                {isFocused && showEmojiPicker && (
                  <div
                    ref={emojiPanelRef}
                    className="fixed z-50 max-h-64 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
                    style={{ left: emojiPickerPos?.left ?? 16, top: emojiPickerPos?.top ?? 100, width: emojiPickerPos?.width ?? 420 }}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  >
                    <div className="flex">
                      {/* 左侧分类按钮 */}
                      <div className="w-16 border-r border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
                        {EMOJI_CATEGORIES.map((cat) => (
                          <button
                            key={cat.key}
                            className={cn(
                              "w-full px-2 py-2 text-sm transition-colors text-center",
                              activeEmojiCategory === cat.key
                                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            )}
                            onMouseDown={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveEmojiCategory(cat.key);
                              await ensureEmojiCategoryLoaded(cat.key);
                            }}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>

                      {/* 右侧具体表情列表 */}
                      <div className="flex-1 p-2 overflow-y-auto scrollbar-transparent" style={{ maxHeight: '16rem' }}>
                        {((emojiMap[activeEmojiCategory] || []).length > 0) ? (
                          <div className="grid grid-cols-8 gap-2">
                            {(emojiMap[activeEmojiCategory] || []).map((item) => {
                              const name = item.name;
                              const base = EMOJI_CATEGORIES.find(c => c.key === activeEmojiCategory)?.basePath || '';
                              const url = item.file ? `${base}/${item.file}` : buildEmojiUrl(activeEmojiCategory, name);
                              return (
                                <button
                                  key={`emoji-${activeEmojiCategory}-${name}`}
                                  className="group w-9 h-9 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
                                  title={name}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    insertEmojiSyntax(activeEmojiCategory, name);
                                    setShowEmojiPicker(false);
                                  }}
                                >
                                  <img
                                    src={url}
                                    alt={`emoji:${activeEmojiCategory}_${name}`}
                                    className="inline-block transform-gpu transition-transform duration-150 ease-out group-hover:scale-125"
                                    style={{ height: '1.2em', width: 'auto', objectFit: 'contain', verticalAlign: '-0.2em' }}
                                    loading="lazy"
                                  />
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400 space-y-2">
                            <div>未检测到 {activeEmojiCategory} 表情清单。</div>
                            <div>请在 <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">public/emoji/{activeEmojiCategory}/</code> 下创建 <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">manifest.json</code> 来显示内容</div>
                            <pre className="text-[11px] bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700 overflow-auto">[ "weixiao", "shengqi" ]</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 右侧：快捷键提示 */}
              {onSubmit && (
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  <kbd className="px-1 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">Ctrl</kbd>
                  {' + '}
                  <kbd className="px-1 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">Enter</kbd>
                  {' 保存'}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default MemoEditor;

