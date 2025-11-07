import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const DesktopTitleBar = ({ title = 'MeowNocode', className }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximizedState = async () => {
      if (window.electronAPI?.window) {
        const maximized = await window.electronAPI.window.isMaximized();
        setIsMaximized(maximized);
      }
    };

    // 检查是否为桌面端
    if (window.electronConfig?.isDesktop) {
      checkMaximizedState();
    }
  }, []);

  const handleMinimize = async () => {
    if (window.electronAPI?.window) {
      await window.electronAPI.window.minimize();
    }
  };

  const handleMaximize = async () => {
    if (window.electronAPI?.window) {
      const maximized = await window.electronAPI.window.maximize();
      setIsMaximized(maximized);
    }
  };

  const handleClose = async () => {
    if (window.electronAPI?.window) {
      await window.electronAPI.window.close();
    }
  };

  // 只在桌面端显示
  if (!window.electronConfig?.isDesktop) {
    return null;
  }

  return (
    <div className={cn(
      'flex items-center justify-between h-8 bg-background border-b border-border select-none',
      'drag-region', // 添加拖拽区域类
      className
    )}>
      {/* 左侧标题区域 - 可拖拽 */}
      <div className="flex items-center px-4 flex-1 h-full drag-region">
        <span className="text-sm font-medium text-foreground truncate">
          {title}
        </span>
      </div>

      {/* 右侧控制按钮区域 - 不可拖拽 */}
      <div className="flex items-center h-full no-drag">
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-12 h-full hover:bg-muted/50 transition-colors text-foreground"
          aria-label="最小化"
        >
          <Minus className="w-4 h-4" />
        </button>

        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-12 h-full hover:bg-muted/50 transition-colors text-foreground"
          aria-label={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? (
            <Square className="w-3 h-3" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>

        <button
          onClick={handleClose}
          className="flex items-center justify-center w-12 h-full hover:bg-red-500/50 hover:text-red-100 transition-colors text-foreground"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <style jsx>{`
        .drag-region {
          -webkit-app-region: drag;
        }
        .no-drag {
          -webkit-app-region: no-drag;
        }
      `}</style>
    </div>
  );
};

export default DesktopTitleBar;