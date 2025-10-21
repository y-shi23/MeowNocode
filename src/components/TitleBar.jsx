import React, { useState, useEffect } from 'react';
import { X, Minus, Square } from 'lucide-react';
import { isTauri } from '@/lib/utils';

let cachedAppWindow = null;

async function getAppWindow() {
  if (!isTauri()) return null;
  if (cachedAppWindow) return cachedAppWindow;
  const mod = await import('@tauri-apps/api/window');
  cachedAppWindow = mod.appWindow;
  return cachedAppWindow;
}

const TitleBar = ({ className = '' }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      if (!isTauri()) return;
      try {
        const appWindow = await getAppWindow();
        if (appWindow) {
          const maximized = await appWindow.isMaximized();
          setIsMaximized(maximized);
        }
      } catch (error) {
        console.warn('Failed to check window maximized state:', error);
      }
    };

    checkMaximized();
    if (!isTauri()) return undefined;

    let unlistenResize = null;

    (async () => {
      try {
        const appWindow = await getAppWindow();
        if (!appWindow) return;
        unlistenResize = await appWindow.onResized(checkMaximized);
      } catch (error) {
        console.warn('Failed to listen window resize events:', error);
      }
    })();

    return () => {
      if (typeof unlistenResize === 'function') {
        try { unlistenResize(); } catch (error) { console.warn('Failed to remove resize listener:', error); }
      }
    };
  }, []);

  const handleMinimize = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isTauri()) return;
    
    try {
      const appWindow = await getAppWindow();
      if (appWindow) {
        await appWindow.minimize();
      }
    } catch (error) {
      console.warn('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isTauri()) return;
    
    try {
      const appWindow = await getAppWindow();
      if (appWindow) {
        const currentlyMaximized = await appWindow.isMaximized();
        if (currentlyMaximized) {
          await appWindow.unmaximize();
        } else {
          await appWindow.maximize();
        }
        const updatedState = await appWindow.isMaximized();
        setIsMaximized(updatedState);
      }
    } catch (error) {
      console.warn('Failed to toggle maximize:', error);
    }
  };

  const handleClose = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isTauri()) return;
    
    try {
      const appWindow = await getAppWindow();
      if (appWindow) {
        await appWindow.close();
      }
    } catch (error) {
      console.warn('Failed to close window:', error);
    }
  };

  const handleMouseDown = async (e) => {
    if (!isTauri()) return;
    
    // 检查是否点击了按钮或其子元素
    const isButton = e.target.closest('.titlebar-button');
    if (isButton) return;
    
    // 检查是否在拖动状态
    if (isDragging) return;
    
    try {
      const appWindow = await getAppWindow();
      if (appWindow) {
        setIsDragging(true);
        await appWindow.startDragging();
      }
    } catch (error) {
      console.warn('Failed to start dragging:', error);
      setIsDragging(false);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!isTauri()) {
    return null;
  }

  return (
    <div
      className={`flex items-center justify-between h-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 select-none ${className}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      data-tauri-drag-region
      style={{ borderTopLeftRadius: 'var(--window-radius)', borderTopRightRadius: 'var(--window-radius)' }}
    >
      <div className="flex-1" data-tauri-drag-region />
      
      <div className="flex items-center">
        <button
          className="titlebar-button flex items-center justify-center w-10 h-10 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          onMouseDown={handleMinimize}
          title="最小化"
          data-tauri-drag-region="false"
          type="button"
        >
          <Minus className="h-4 w-4" />
        </button>
        
        <button
          className="titlebar-button flex items-center justify-center w-10 h-10 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          onMouseDown={handleMaximize}
          title={isMaximized ? "还原" : "最大化"}
          data-tauri-drag-region="false"
          type="button"
        >
          <Square className="h-4 w-4" />
        </button>
        
        <button
          className="titlebar-button flex items-center justify-center w-10 h-10 text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
          onMouseDown={handleClose}
          title="关闭"
          data-tauri-drag-region="false"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;