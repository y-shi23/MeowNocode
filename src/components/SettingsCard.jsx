import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { X, Palette, Download, Upload, AlertCircle, CheckCircle, Settings, Database, ChevronDown, ChevronUp, Check, Image as ImageIcon, Github, Cloud, Server, Key, Bot, Keyboard, Star, Music2, Type, Quote } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useSettings } from '@/context/SettingsContext';
import { usePasswordAuth } from '@/context/PasswordAuthContext';
import { D1ApiClient } from '@/lib/d1-api';
import ImageUpload from './ImageUpload';
import { toast } from 'sonner';
import MemosImport from './MemosImport';
import MusicListManager from './MusicListManager';
import S3ConfigPanel from './S3ConfigPanel';

const SettingsCard = ({ isOpen, onClose, onOpenTutorial }) => {
  const { themeColor, updateThemeColor } = useTheme();
  const settingsCtx = useSettings() || {};
  const {
    hitokotoConfig = { enabled: true, types: ['a','b','c','d','i','j','k'] },
    updateHitokotoConfig = () => {},
    fontConfig = { selectedFont: 'default', fontSize: 16 },
    updateFontConfig = () => {},
    backgroundConfig = { imageUrl: '', brightness: 50, blur: 10, useRandom: false },
    updateBackgroundConfig = () => {},
    avatarConfig = { imageUrl: '' },
    updateAvatarConfig = () => {},
  cloudSyncEnabled = false,
  updateCloudSyncEnabled = () => {},
  isSelfHosted = false,
    manualSync = async () => ({ success: false, message: 'unavailable' }),
    aiConfig = { enabled: false, baseUrl: '', model: '', apiKey: '' },
    updateAiConfig = () => {},
    keyboardShortcuts = { toggleSidebar: 'Ctrl+B', openAIDialog: 'Ctrl+K', openSettings: 'Ctrl+,', toggleCanvasMode: 'Ctrl+Shift+C', openDailyReview: 'Ctrl+R' },
    updateKeyboardShortcuts = () => {},
    _scheduleCloudSync = () => {},
    musicConfig = { enabled: false, playlists: [] },
    updateMusicConfig = () => {},
    s3Config = { enabled: false },
    updateS3Config = () => {},
  } = settingsCtx;
  const { isAuthenticated } = usePasswordAuth();
  const [tempColor, setTempColor] = useState(themeColor);
  const [activeTab, setActiveTab] = useState('general');

  const [isSyncing, setIsSyncing] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    hitokoto: false,
    font: false,
    appearance: false,
  ai: false,
  music: false,
    keyboard: false,
    storage: false,
    about: false
  });
  const [githubStars, setGithubStars] = useState(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState(null);
  const [fontLoading, setFontLoading] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(null);
  const [tempShortcuts, setTempShortcuts] = useState(keyboardShortcuts);
  const [pressedKeys, setPressedKeys] = useState(new Set());
  const [recordingTimeout, setRecordingTimeout] = useState(null);



  useEffect(() => {
    if (isOpen) {
      setTempColor(themeColor);
      setTempShortcuts(keyboardShortcuts);
      
    }
  }, [isOpen, themeColor, keyboardShortcuts]);

  const handleCustomColorChange = (e) => {
    const color = e.target.value;
    setTempColor(color);
    updateThemeColor(color);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };



  const handleHitokotoConfigChange = (field, value) => {
    updateHitokotoConfig({ [field]: value });
  };

  const handleBackgroundConfigChange = (field, value) => {
    // 冲突处理：当设置 imageUrl 时，自动关闭随机背景
    if (field === 'imageUrl') {
      updateBackgroundConfig({ imageUrl: value, useRandom: value ? false : backgroundConfig.useRandom });
      return;
    }
    updateBackgroundConfig({ [field]: value });
  };

  const handleAvatarConfigChange = (field, value) => {
    if (updateAvatarConfig) {
      updateAvatarConfig({ [field]: value });
    }
  };

  const handleHitokotoTypeToggle = (type) => {
    const newTypes = hitokotoConfig.types.includes(type)
      ? hitokotoConfig.types.filter(t => t !== type)
      : [...hitokotoConfig.types, type];
    updateHitokotoConfig({ types: newTypes });
  };



  // 统一"手动同步"处理函数：三向合并 + 删除墓碑
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const result = await manualSync();
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } catch (e) {
      toast.error(e?.message || '同步失败');
    } finally {
      setIsSyncing(false);
    }
  };




  const handleExportLocalData = () => {
    const data = {
      memos: localStorage.getItem('memos') || '[]',
      pinnedMemos: localStorage.getItem('pinnedMemos') || '[]',
      themeColor: localStorage.getItem('themeColor') || '#818CF8',
      darkMode: localStorage.getItem('darkMode') || 'false',
      hitokotoConfig: localStorage.getItem('hitokotoConfig') || '{"enabled":true,"types":["a","b","c","d","i","j","k"]}',
      fontConfig: localStorage.getItem('fontConfig') || '{"selectedFont":"default"}',
      backgroundConfig: localStorage.getItem('backgroundConfig') || '{"imageUrl":"","brightness":50,"blur":10,"useRandom":false}'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meow-app-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('本地数据导出成功');
  };

  const handleImportLocalData = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        
        if (data.memos && data.pinnedMemos) {
          localStorage.setItem('memos', data.memos);
          localStorage.setItem('pinnedMemos', data.pinnedMemos);
          localStorage.setItem('themeColor', data.themeColor || '#818CF8');
          localStorage.setItem('darkMode', data.darkMode || 'false');
          localStorage.setItem('hitokotoConfig', data.hitokotoConfig || '{"enabled":true,"types":["a","b","c","d","i","j","k"]}');
          localStorage.setItem('fontConfig', data.fontConfig || '{"selectedFont":"default"}');
          localStorage.setItem('backgroundConfig', data.backgroundConfig || '{"imageUrl":"","brightness":50,"blur":10,"useRandom":false}');
          // 通知全局数据变更并尝试触发一次自动同步
          try { window.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { part: 'import' } })); } catch {}
          try { typeof _scheduleCloudSync === 'function' && _scheduleCloudSync('import'); } catch {}
          
          toast.success('本地数据导入成功，请刷新页面查看');
        } else {
          toast.error('导入文件格式不正确');
        }
      } catch (error) {
        toast.error('解析文件失败: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  // 处理字体选择变化
  const handleFontChange = async (fontName) => {
    if (fontName !== 'default') {
      setFontLoading(true);
      // 模拟字体加载时间
      setTimeout(() => {
        setFontLoading(false);
      }, 1000);
    }

    updateFontConfig({ selectedFont: fontName });
  };

  const baseFontSize = Number(fontConfig?.fontSize) || 16;
  const presetSizes = [
    { value: 14, label: '更小：14px' },
    { value: 15, label: '稍小：15px' },
    { value: 16, label: '推荐：16px' },
    { value: 17, label: '稍大：17px' },
    { value: 18, label: '更大：18px' },
  ];
  const currentPreset = presetSizes.find(p => p.value === baseFontSize) ? String(baseFontSize) : 'custom';
  // 自定义字体大小下拉状态
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false);
  const fontSizeBtnRef = useRef(null);
  const fontSizeMenuRef = useRef(null);

  useEffect(() => {
    if (!fontSizeMenuOpen) return;
    const onDocClick = (e) => {
      if (fontSizeBtnRef.current && fontSizeBtnRef.current.contains(e.target)) return;
      if (fontSizeMenuRef.current && fontSizeMenuRef.current.contains(e.target)) return;
      setFontSizeMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [fontSizeMenuOpen]);

  // 处理快捷键录制
  const handleShortcutRecord = (shortcutType) => {
    setRecordingShortcut(shortcutType);
  };
  // 处理键盘事件录制快捷键
  const handleKeyDown = (e) => {
    if (!recordingShortcut) return;

    e.preventDefault();
    let key = e.key;
    if (key === 'Control') key = 'Ctrl';
    if (key === 'Meta') key = 'Ctrl';
    if (key === 'Alt') key = 'Alt';
    if (key === 'Shift') key = 'Shift';

    setPressedKeys(prev => {
      const newSet = new Set(prev);
      newSet.add(key);
      return newSet;
    });

    if (recordingTimeout) {
      clearTimeout(recordingTimeout);
      setRecordingTimeout(null);
    }
  };

  // 处理按键释放事件（使用按下瞬间的快照，避免组合被清空）
  const handleKeyUp = (e) => {
    if (!recordingShortcut) return;

    let key = e.key;
    if (key === 'Control') key = 'Ctrl';
    if (key === 'Meta') key = 'Ctrl';
    if (key === 'Alt') key = 'Alt';
    if (key === 'Shift') key = 'Shift';

    const modifierKeys = ['Ctrl', 'Alt', 'Shift'];

    setPressedKeys(prev => {
      // 释放前的完整组合快照（包含主键）
      const snapshot = new Set(prev);
      // 模拟释放后的集合
      const afterRelease = new Set(prev);
      afterRelease.delete(key);

      const remainingKeys = Array.from(afterRelease);
      const hasOnlyModifiers = remainingKeys.every(k => modifierKeys.includes(k));

      // 只有当释放后只剩修饰键或无键时才完成录制，使用释放前的快照保证包含主键
      if (remainingKeys.length === 0 || hasOnlyModifiers) {
        completeShortcutRecording(snapshot);
      }

      return afterRelease;
    });
  };

  // 完成快捷键录制（支持传入快照，避免依赖异步 state）
  const completeShortcutRecording = (keysSnapshot) => {
    const keysSet = keysSnapshot ? new Set(keysSnapshot) : pressedKeys;
    if (!recordingShortcut || keysSet.size === 0) {
      stopRecording();
      return;
    }

    const modifierKeys = ['Ctrl', 'Alt', 'Shift'];
    const modifiers = Array.from(keysSet).filter(key => modifierKeys.includes(key));
    const mainKeys = Array.from(keysSet).filter(key => !modifierKeys.includes(key));

    if (mainKeys.length === 0) {
      stopRecording();
      return;
    }

    const orderedModifiers = [];
    if (modifiers.includes('Ctrl')) orderedModifiers.push('Ctrl');
    if (modifiers.includes('Alt')) orderedModifiers.push('Alt');
    if (modifiers.includes('Shift')) orderedModifiers.push('Shift');

    const mainKey = mainKeys[mainKeys.length - 1];

    const keyMap = {
      ' ': 'Space',
      ',': ',',
      '.': '.',
      ';': ';',
      '[': '[',
      ']': ']',
      '\\': '\\',
      "'": "'",
      '/': '/',
      'Tab': 'Tab',
      'Enter': 'Enter',
      'Escape': 'Escape',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown',
      'Home': 'Home',
      'End': 'End',
      'Insert': 'Insert',
      'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
      'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12'
    };

    const displayKey = keyMap[mainKey] || mainKey.toUpperCase();
    const shortcutString = [...orderedModifiers, displayKey].join('+');

    setTempShortcuts(prev => ({
      ...prev,
      [recordingShortcut]: shortcutString
    }));

    updateKeyboardShortcuts({
      [recordingShortcut]: shortcutString
    });

    stopRecording();
  };

  // 停止录制
  const stopRecording = () => {
    setRecordingShortcut(null);
    setPressedKeys(new Set());
    if (recordingTimeout) {
      clearTimeout(recordingTimeout);
      setRecordingTimeout(null);
    }
  };

  // 格式化按键显示
  const formatKeyDisplay = (key) => {
    const keyMap = {
      'Ctrl': 'Ctrl',
      'Alt': 'Alt', 
      'Shift': 'Shift',
      ' ': 'Space',
      'Tab': 'Tab',
      'Enter': 'Enter',
      'Escape': 'Esc',
      'Backspace': '⌫',
      'Delete': '⌦',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'PageUp': 'PgUp',
      'PageDown': 'PgDn',
      'Home': 'Home',
      'End': 'End',
      'Insert': 'Ins'
    };
    return keyMap[key] || key.toUpperCase();
  };

  // 获取排序后的按键显示
  const getSortedKeyDisplay = () => {
    const modifierOrder = ['Ctrl', 'Alt', 'Shift'];
    const modifiers = Array.from(pressedKeys).filter(key => modifierOrder.includes(key));
    const otherKeys = Array.from(pressedKeys).filter(key => !modifierOrder.includes(key));
    
    // 按标准顺序排列
    const sortedModifiers = modifiers.sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b));
    const sortedKeys = [...sortedModifiers, ...otherKeys];
    
    return sortedKeys.map(formatKeyDisplay).join(' + ');
  };

  // 添加全局键盘事件监听
  useEffect(() => {
    if (recordingShortcut) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);

      const timeoutId = setTimeout(() => {
        if (pressedKeys.size > 0) {
          completeShortcutRecording(new Set(pressedKeys));
        }
      }, 1000);
      setRecordingTimeout(timeoutId);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
      };
    }
  }, [recordingShortcut]);

  // 清理超时
  useEffect(() => {
    return () => {
      if (recordingTimeout) {
        clearTimeout(recordingTimeout);
      }
    };
  }, [recordingTimeout]);

  // 点击外部区域退出录制模式
  useEffect(() => {
    if (recordingShortcut) {
      const handleClickOutside = (e) => {
        if (!e.target.closest('.shortcut-recording')) {
          stopRecording();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [recordingShortcut]);

  // 切换折叠面板
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // 当展开关于时拉取 GitHub star 数
  useEffect(() => {
    const fetchStars = async () => {
      if (!expandedSections.about) return;
      setGithubLoading(true);
      setGithubError(null);
      try {
        const res = await fetch('https://api.github.com/repos/y-shi23/MeowNocode', { headers: { 'Accept': 'application/vnd.github+json' } });
        if (!res.ok) throw new Error('加载失败');
        const data = await res.json();
        setGithubStars(typeof data.stargazers_count === 'number' ? data.stargazers_count : null);
      } catch (e) {
        setGithubError('无法获取 Star 数');
      } finally {
        setGithubLoading(false);
      }
    };
    fetchStars();
  }, [expandedSections.about]);

  // 注入隐藏 number input 原生微调按钮样式（仅执行一次）
  useEffect(() => {
    try {
      let style = document.getElementById('no-spinner-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'no-spinner-style';
        style.textContent = `
          input.no-spinner::-webkit-outer-spin-button,
          input.no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
          input.no-spinner[type=number] { -moz-appearance: textfield; }
        `;
        document.head.appendChild(style);
      }
    } catch (e) {
      // ignore style injection failure
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <Card className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-gray-800 shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-semibold flex items-center">
            <Settings className="h-5 w-5 mr-2" style={{ color: themeColor }} />
            设置
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        {/* 标签页导航 */}
        <div className="px-6 pb-4">
          <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'general'
                  ? 'bg-white dark:bg-gray-800 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              style={activeTab === 'general' ? { color: themeColor } : {}}
            >
              <Settings className="h-4 w-4 mr-2" />
              常规
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'data'
                  ? 'bg-white dark:bg-gray-800 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              style={activeTab === 'data' ? { color: themeColor } : {}}
            >
              <Database className="h-4 w-4 mr-2" />
              数据
            </button>
          </div>
        </div>

        {/* 滚动容器 - 添加了scrollbar-hidden类 */}
        <CardContent className="space-y-6 flex-1 overflow-y-auto scrollbar-hidden">

          {/* 常规设置 */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* 主题色设置 */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">主题色</Label>

                {/* 自定义颜色输入 */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-10 h-10 rounded-lg border-2 border-gray-200 dark:border-gray-600 flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: tempColor }}
                      title="颜色预览"
                    />
                    <Input
                      type="text"
                      value={tempColor}
                      onChange={(e) => handleCustomColorChange(e)}
                      placeholder="#818CF8"
                      className="flex-1 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* 字体设置 - 改为折叠面板 */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('font')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Type className="h-4 w-4 mr-2" />
                    字体设置
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('font');
                    }}
                  >
                    {expandedSections.font ?
                      <ChevronUp className="h-4 w-4" /> :
                      <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                </div>

                {/* 折叠内容 - 添加平滑过渡动画 */}
                {expandedSections.font && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                  <div id="font-form-container" className="space-y-4 pl-4 pr-2 pb-4">
                    {/* 字体选择网格 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { value: 'default', name: '默认字体', preview: 'Aa 默认', desc: '系统默认字体' },
                        { value: 'jinghua', name: '京华老宋体', preview: 'Aa 宋体', desc: '传统宋体，适合正式文档' },
                        { value: 'lxgw', name: '霞鹜文楷', preview: 'Aa 文楷', desc: '现代楷体，易读性佳' },
                        { value: 'kongshan', name: '空山', preview: 'Aa 空山', desc: '艺术字体，独特风格' }
                      ].map((font) => (
                      <button
                        key={font.value}
                        onClick={() => handleFontChange(font.value)}
                        title={font.desc}
                        className={`p-3 rounded-lg border-2 transition-all duration-200 text-left hover:shadow-md ${
                          fontConfig.selectedFont === font.value
                            ? 'border-current shadow-md'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                        } bg-white dark:bg-gray-700`}
                        style={fontConfig.selectedFont === font.value ? {
                          borderColor: themeColor,
                          backgroundColor: `${themeColor}10`
                        } : {}}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col space-y-1 flex-1">
                            <div
                              className={`text-lg font-medium ${
                                font.value !== 'default' ? `font-preview-${font.value}` : ''
                              }`}
                            >
                              {font.preview}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {font.name}
                            </div>
                          </div>
                          {fontConfig.selectedFont === font.value && (
                            <Check
                              className="h-4 w-4 flex-shrink-0 mt-1"
                              style={{ color: themeColor }}
                            />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* 字体大小设置 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="col-span-2 space-y-2">
                      <Label className="text-sm font-medium">字体大小</Label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <button
                            type="button"
                            ref={fontSizeBtnRef}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFontSizeMenuOpen(o => !o); }}
                            className="w-full h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-3 pr-8 text-sm text-left shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none"
                          >
                            {currentPreset === 'custom' ? `自定义：${baseFontSize}px` : (presetSizes.find(p => String(p.value) === currentPreset)?.label || '选择字号')}
                            <ChevronDown
                              className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 transition-transform ${fontSizeMenuOpen ? 'rotate-180' : ''}`}
                            />
                          </button>
                          {fontSizeMenuOpen && (
                            <div
                              ref={fontSizeMenuRef}
                              className="absolute left-0 right-0 mt-1 z-40 border rounded-md shadow-lg overflow-hidden bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 animate-in fade-in zoom-in-95"
                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            >
                              <div className="py-1 max-h-64 overflow-auto custom-scrollbar">
                                {presetSizes.map(p => (
                                  <button
                                    key={`size-${p.value}`}
                                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${p.value === baseFontSize ? 'bg-gray-100 dark:bg-gray-600/60' : 'hover:bg-gray-100 dark:hover:bg-gray-600/60'}`}
                                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateFontConfig({ fontSize: p.value }); setFontSizeMenuOpen(false); }}
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={10}
                            max={32}
                            step={1}
                            value={baseFontSize}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!Number.isNaN(v)) {
                                const clamped = Math.max(10, Math.min(32, v));
                                updateFontConfig({ fontSize: clamped });
                              }
                            }}
                            className="w-24 text-sm no-spinner"
                            onWheel={(e) => {
                              e.preventDefault();
                              const delta = e.deltaY < 0 ? 1 : -1;
                              const next = Math.max(10, Math.min(32, (Number(baseFontSize) || 16) + delta));
                              updateFontConfig({ fontSize: next });
                            }}
                            style={{ appearance: 'textfield' }}
                          />
                          <span className="text-sm text-gray-500 dark:text-gray-400">px</span>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-1 text-right text-xs text-gray-500 dark:text-gray-400">默认 16px</div>
                  </div>

                  {/* 字体预览区域 */}
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600" style={{ fontSize: `${baseFontSize}px` }}>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">预览效果：</div>
                    {fontLoading ? (
                      <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-current"></div>
                        <span>字体加载中...</span>
                      </div>
                    ) : (
                      <div
                        className={`text-gray-900 dark:text-white transition-all duration-300 ${
                          fontConfig.selectedFont !== 'default' ? 'custom-font-content' : ''
                        }`}
                      >
                        现在的想法是……记录生活中的点点滴滴，感受文字的魅力。
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    字体将应用于所有Memos、编辑器、每日一言和标签管理
                  </p>
                  </div>
                  </div>
                )}
              </div>

              {/* 外观设置 - 折叠面板 */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('appearance')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <ImageIcon className="h-4 w-4 mr-2" />
                    外观设置
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('appearance');
                    }}
                  >
                    {expandedSections.appearance ?
                      <ChevronUp className="h-4 w-4" /> :
                      <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                </div>

                {/* 折叠内容 - 添加平滑过渡动画 */}
                {expandedSections.appearance && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-6 pl-4 pr-2 pb-4">
                      {/* 头像设置 */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">用户头像</Label>
                        <ImageUpload
                          value={avatarConfig?.imageUrl || ''}
                          onChange={(url) => handleAvatarConfigChange('imageUrl', url)}
                          onClear={() => handleAvatarConfigChange('imageUrl', '')}
                          uploadType="avatar"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {avatarConfig?.imageUrl
                            ? '自定义头像将覆盖默认头像显示'
                            : '未设置时将使用默认头像或GitHub头像（如果已登录GitHub）'
                          }
                        </p>
                      </div>

                      {/* 分割线 */}
                      <div className="border-t border-gray-200 dark:border-gray-700"></div>

                      {/* 背景图片设置 */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">背景图片</Label>
                        {/* 使用随机背景 开关 */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm">使用随机背景</span>
                          <button
                            onClick={() => {
                              const next = !backgroundConfig.useRandom;
                              // 开启随机背景时，清空自定义图片以避免冲突
                              if (next) {
                                updateBackgroundConfig({ useRandom: true, imageUrl: '' });
                              } else {
                                updateBackgroundConfig({ useRandom: false });
                              }
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              backgroundConfig.useRandom
                                ? 'bg-blue-600'
                                : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                            style={backgroundConfig.useRandom ? { backgroundColor: themeColor } : {}}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                backgroundConfig.useRandom ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                        {backgroundConfig.useRandom && !backgroundConfig.imageUrl && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">启用后，将从 https://imgapi.xl0408.top/index.php 随机获取背景图片。</p>
                        )}
                        <ImageUpload
                          value={backgroundConfig.imageUrl}
                          onChange={(url) => handleBackgroundConfigChange('imageUrl', url)}
                          onClear={() => handleBackgroundConfigChange('imageUrl', '')}
                          uploadType="background"
                        />
                        {backgroundConfig.useRandom && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">提示：随机背景与自定义背景互斥，开启随机背景时将清空自定义背景。</p>
                        )}

                        {/* 有背景或使用随机背景时显示效果调节 */}
                        {(backgroundConfig.imageUrl || backgroundConfig.useRandom) && (
                          <div className="space-y-4">
                            {/* 亮度调节 */}
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                亮度 ({backgroundConfig.brightness}%)
                              </Label>
                              <Slider
                                value={[backgroundConfig.brightness]}
                                onValueChange={(value) => handleBackgroundConfigChange('brightness', value[0])}
                                max={100}
                                min={0}
                                step={1}
                                className="w-full"
                              />
                            </div>

                            {/* 磨砂玻璃效果调节 */}
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                磨砂玻璃效果 ({backgroundConfig.blur}px)
                              </Label>
                              <Slider
                                value={[backgroundConfig.blur]}
                                onValueChange={(value) => handleBackgroundConfigChange('blur', value[0])}
                                max={50}
                                min={0}
                                step={1}
                                className="w-full"
                              />
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {backgroundConfig.imageUrl
                            ? '调节亮度和磨砂玻璃效果，点击图片右上角×可移除背景'
                            : (backgroundConfig.useRandom
                                ? '随机背景开启中，可在侧边栏点击爱心收藏当前背景'
                                : '拖拽图片文件或粘贴图片链接来设置背景')
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 音乐功能 - 折叠面板（放在外观设置下面） */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('music')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Music2 className="h-4 w-4 mr-2" />
                    音乐功能
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('music');
                    }}
                  >
                    {expandedSections.music ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {expandedSections.music && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-4 pl-4 pr-2 pb-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">启用音乐功能</Label>
                        <button
                          onClick={() => {
                            const next = !musicConfig.enabled;
                            updateMusicConfig({ enabled: next });
                            if (!next) {
                              try {
                                window.dispatchEvent(new CustomEvent('music:globalDisable'));
                              } catch {}
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            musicConfig.enabled
                              ? 'bg-blue-600'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                          style={musicConfig.enabled ? { backgroundColor: themeColor } : {}}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              musicConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        关闭后：隐藏所有音乐按钮与小组件，且停止播放。
                      </p>
                      
                      {/* 音乐列表管理器 */}
                      {musicConfig.enabled && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <MusicListManager 
                            musicConfig={musicConfig} 
                            updateMusicConfig={updateMusicConfig} 
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* S3存储配置 - 移动到数据标签页 */}
              {/* 已移动到数据标签页 */}

              {/* 一言设置 - 改为折叠面板 */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('hitokoto')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Quote className="h-4 w-4 mr-2" />
                    一言设置
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('hitokoto');
                    }}
                  >
                    {expandedSections.hitokoto ?
                      <ChevronUp className="h-4 w-4" /> :
                      <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                </div>

                {/* 折叠内容 - 添加平滑过渡动画 */}
                {expandedSections.hitokoto && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                  <div id="hitokoto-form-container" className="space-y-4 pl-4 pr-2 pb-4">
                      {/* 一言启用开关 */}
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">显示一言</Label>
                        <button
                          onClick={() => handleHitokotoConfigChange('enabled', !hitokotoConfig.enabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            hitokotoConfig.enabled
                              ? 'bg-blue-600'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                          style={hitokotoConfig.enabled ? { backgroundColor: themeColor } : {}}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              hitokotoConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {/* 一言类型选择 */}
                      {hitokotoConfig.enabled && (
                        <div className="space-y-3">
                          <Label className="text-sm">句子类型（可多选）</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { key: 'a', label: '动画' },
                              { key: 'b', label: '漫画' },
                              { key: 'c', label: '游戏' },
                              { key: 'd', label: '文学' },
                              { key: 'i', label: '诗词' },
                              { key: 'j', label: '网易云' },
                              { key: 'k', label: '哲学' }
                            ].map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => handleHitokotoTypeToggle(key)}
                                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                                  hitokotoConfig.types.includes(key)
                                    ? 'border-transparent text-white'
                                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                                }`}
                                style={hitokotoConfig.types.includes(key) ? {
                                  backgroundColor: themeColor,
                                  borderColor: themeColor
                                } : {}}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {hitokotoConfig.types.length === 0 && (
                            <p className="text-xs text-red-500">请至少选择一种句子类型</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* AI设置 - 折叠面板 */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('ai')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Bot className="h-4 w-4 mr-2" />
                    AI设置
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('ai');
                    }}
                  >
                    {expandedSections.ai ?
                      <ChevronUp className="h-4 w-4" /> :
                      <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                </div>

                {/* 折叠内容 - 添加平滑过渡动画 */}
                {expandedSections.ai && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-4 pl-4 pr-2 pb-4">
                      {/* AI启用开关 */}
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">启用AI功能</Label>
                        <button
                          onClick={() => updateAiConfig({ enabled: !aiConfig.enabled })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            aiConfig.enabled
                              ? 'bg-blue-600'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                          style={aiConfig.enabled ? { backgroundColor: themeColor } : {}}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              aiConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {/* AI配置选项 */}
                      {aiConfig.enabled && (
                        <div className="space-y-4">
                          {/* Base URL设置 */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">API Base URL</Label>
                            <Input
                              type="text"
                              value={aiConfig.baseUrl}
                              onChange={(e) => updateAiConfig({ baseUrl: e.target.value })}
                              placeholder="https://api.openai.com/v1"
                              className="w-full"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              兼容OpenAI格式的API地址，例如：https://api.openai.com/v1
                            </p>
                          </div>

                         {/* 模型设置 */}
                         <div className="space-y-2">
                           <Label className="text-sm font-medium">模型名称</Label>
                           <Input
                             type="text"
                             value={aiConfig.model}
                             onChange={(e) => updateAiConfig({ model: e.target.value })}
                             placeholder="gpt-3.5-turbo"
                             className="w-full"
                           />
                           <p className="text-xs text-gray-500 dark:text-gray-400">
                             输入您想使用的AI模型名称，例如：gpt-3.5-turbo、gpt-4、claude-3-sonnet-20240229等
                           </p>
                         </div>

                         {/* API Key设置 */}
                         <div className="space-y-2">
                           <Label className="text-sm font-medium">API Key</Label>
                           <Input
                             type="password"
                             value={aiConfig.apiKey}
                             onChange={(e) => updateAiConfig({ apiKey: e.target.value })}
                             placeholder="sk-..."
                             className="w-full"
                           />
                           <p className="text-xs text-gray-500 dark:text-gray-400">
                             您的API密钥将安全存储在本地浏览器中
                           </p>
                         </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 快捷键设置 - 折叠面板 */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('keyboard')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Keyboard className="h-4 w-4 mr-2" />
                    快捷键设置
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('keyboard');
                    }}
                  >
                    {expandedSections.keyboard ?
                      <ChevronUp className="h-4 w-4" /> :
                      <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                </div>

                {/* 折叠内容 - 添加平滑过渡动画 */}
                {expandedSections.keyboard && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-4 pl-4 pr-2 pb-4">
                      {/* 快捷键设置 */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">快捷键设置</Label>
                        <div className="grid grid-cols-1 gap-3">
                          {/* 切换侧栏快捷键 */}
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex flex-col space-y-1 flex-1">
                              <span className="text-sm font-medium">取消/固定侧栏</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">切换左右侧栏的固定状态</span>
                            </div>
                            <button
                              onClick={() => handleShortcutRecord('toggleSidebar')}
                              className={`shortcut-recording px-3 py-2 text-sm rounded-lg border transition-colors text-left min-w-[100px] ${
                                recordingShortcut === 'toggleSidebar'
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                              }`}
                            >
                              {recordingShortcut === 'toggleSidebar' ? (
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                    <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">录制中...</span>
                                  </div>
                                  {pressedKeys.size > 0 ? (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 font-mono font-medium">
                                      {getSortedKeyDisplay()}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <kbd className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
                                  {tempShortcuts.toggleSidebar}
                                </kbd>
                              )}
                            </button>
                          </div>

                          {/* AI对话快捷键 */}
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex flex-col space-y-1 flex-1">
                              <span className="text-sm font-medium">AI对话</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">快速打开AI对话功能</span>
                            </div>
                            <button
                              onClick={() => handleShortcutRecord('openAIDialog')}
                              className={`shortcut-recording px-3 py-2 text-sm rounded-lg border transition-colors text-left min-w-[100px] ${
                                recordingShortcut === 'openAIDialog'
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                              }`}
                            >
                              {recordingShortcut === 'openAIDialog' ? (
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                    <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">录制中...</span>
                                  </div>
                                  {pressedKeys.size > 0 ? (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 font-mono font-medium">
                                      {getSortedKeyDisplay()}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <kbd className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
                                  {tempShortcuts.openAIDialog}
                                </kbd>
                              )}
                            </button>
                          </div>

                          {/* 设置快捷键 */}
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex flex-col space-y-1 flex-1">
                              <span className="text-sm font-medium">打开设置</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">快速打开设置面板</span>
                            </div>
                            <button
                              onClick={() => handleShortcutRecord('openSettings')}
                              className={`shortcut-recording px-3 py-2 text-sm rounded-lg border transition-colors text-left min-w-[100px] ${
                                recordingShortcut === 'openSettings'
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                              }`}
                            >
                              {recordingShortcut === 'openSettings' ? (
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                    <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">录制中...</span>
                                  </div>
                                  {pressedKeys.size > 0 ? (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 font-mono font-medium">
                                      {getSortedKeyDisplay()}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <kbd className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
                                  {tempShortcuts.openSettings}
                                </kbd>
                              )}
                            </button>
                          </div>

                          {/* 画布模式快捷键 */}
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex flex-col space-y-1 flex-1">
                              <span className="text-sm font-medium">画布模式</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">快速切换画布模式</span>
                            </div>
                            <button
                              onClick={() => handleShortcutRecord('toggleCanvasMode')}
                              className={`shortcut-recording px-3 py-2 text-sm rounded-lg border transition-colors text-left min-w-[100px] ${
                                recordingShortcut === 'toggleCanvasMode'
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                              }`}
                            >
                              {recordingShortcut === 'toggleCanvasMode' ? (
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                    <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">录制中...</span>
                                  </div>
                                  {pressedKeys.size > 0 ? (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 font-mono font-medium">
                                      {getSortedKeyDisplay()}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <kbd className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
                                  {tempShortcuts.toggleCanvasMode}
                                </kbd>
                              )}
                            </button>
                          </div>

                          {/* 每日回顾快捷键 */}
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex flex-col space-y-1 flex-1">
                              <span className="text-sm font-medium">每日回顾</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">快速打开每日回顾卡片</span>
                            </div>
                            <button
                              onClick={() => handleShortcutRecord('openDailyReview')}
                              className={`shortcut-recording px-3 py-2 text-sm rounded-lg border transition-colors text-left min-w-[100px] ${
                                recordingShortcut === 'openDailyReview'
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                              }`}
                            >
                              {recordingShortcut === 'openDailyReview' ? (
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                    <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">录制中...</span>
                                  </div>
                                  {pressedKeys.size > 0 ? (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 font-mono font-medium">
                                      {getSortedKeyDisplay()}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <kbd className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
                                  {tempShortcuts.openDailyReview}
                                </kbd>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        提示：点击快捷键框，然后按住修饰键（Ctrl、Alt、Shift）再按其他键进行录制。支持组合键如 Ctrl+Space、Alt+Enter 等。
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 关于 - 折叠面板 */}
              <div className="space-y-4">
                <div
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleSection('about')}
                >
                  <Label className="text-sm font-medium cursor-pointer flex items-center">
                    <Github className="h-4 w-4 mr-2" />
                    关于
                  </Label>
                  <button
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('about');
                    }}
                  >
                    {expandedSections.about ?
                      <ChevronUp className="h-4 w-4" /> :
                      <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                </div>

                {expandedSections.about && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-3 pl-4 pr-2 pb-4">
                      {/* GitHub 链接按钮 */}
                      <button
                        onClick={() => window.open('https://github.com/y-shi23/MeowNocode', '_blank')}
                        className="w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all bg-white dark:bg-gray-700 hover:shadow-md"
                        style={{ borderColor: themeColor }}
                        title="前往 GitHub 仓库"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${themeColor}15` }}>
                            <Github className="h-5 w-5" style={{ color: themeColor }} />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-medium">y-shi23/MeowNocode</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">GitHub 仓库</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {githubLoading ? (
                            <span className="text-gray-500">加载中...</span>
                          ) : githubError ? (
                            <span className="text-gray-500">--</span>
                          ) : (
                            <span className="font-medium">{githubStars ?? '--'}</span>
                          )}
                        </div>
                      </button>

                      {/* 教程按钮 */}
                      <button
                        onClick={() => {
                          if (typeof onOpenTutorial === 'function') onOpenTutorial();
                          if (typeof onClose === 'function') onClose();
                        }}
                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-left bg-gray-50 dark:bg-gray-800/50"
                      >
                        <div className="text-sm font-medium mb-0.5">用户教程</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">查看 Memo 编辑与画布模式的基本用法</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 数据管理设置 */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              {/* 云端同步设置 */}
              {!isSelfHosted && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center">
                    <Cloud className="h-4 w-4 mr-2" />
                    云端数据同步
                  </Label>
                  <button
                    onClick={() => updateCloudSyncEnabled(!cloudSyncEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      cloudSyncEnabled
                        ? 'bg-blue-600'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                    style={cloudSyncEnabled ? { backgroundColor: themeColor } : {}}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        cloudSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  </div>

                  {cloudSyncEnabled && (
                  <>
                    {/* 云同步配置 */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">云同步配置 (Cloudflare D1)</Label>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-3">
                          <Server className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              Cloudflare D1 数据库
                            </p>
                            <p className="text-xs text-gray-700 dark:text-gray-300">
                              数据将自动同步到Cloudflare D1数据库
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span className="text-sm text-green-800 dark:text-green-200">
                            已连接到 Cloudflare D1 数据库
                          </span>
                        </div>
                      </div>

                      <div className="flex space-x-2">
                        <Button
                          onClick={handleManualSync}
                          disabled={isSyncing}
                          size="sm"
                          className="flex-1"
                          style={{ backgroundColor: themeColor }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {isSyncing ? '同步中...' : '手动同步'}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                </div>
              )}

              {/* S3存储配置 */}
              <div className="space-y-4">
                <S3ConfigPanel s3Config={s3Config} updateS3Config={updateS3Config} />
              </div>

              {/* 本地数据管理 */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <Label className="text-sm font-medium block mb-4">本地数据管理</Label>
                
                <div className="flex space-x-2">
                  <Button
                    onClick={handleExportLocalData}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    导出本地数据
                  </Button>
                  
                  <input
                    type="file"
                    id="import-local-data"
                    accept=".json"
                    className="hidden"
                    onChange={handleImportLocalData}
                  />
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <label htmlFor="import-local-data">
                      <Upload className="h-4 w-4 mr-2" />
                      导入本地数据
                    </label>
                  </Button>
                </div>
                
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  本地数据包含所有想法、标签和设置，导出为JSON格式
                </p>

                {/* 从 Memos 导入 */}
                <div className="mt-6">
                  <MemosImport />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsCard;
