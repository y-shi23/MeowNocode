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
  }, []);

  const handleMinimize = async () => {
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

  const handleMaximize = async () => {
    if (!isTauri()) return;
    try {
      const appWindow = await getAppWindow();
      if (appWindow) {
        if (isMaximized) {
          await appWindow.unmaximize();
          setIsMaximized(false);
        } else {
          await appWindow.maximize();
          setIsMaximized(true);
        }
      }
    } catch (error) {
      console.warn('Failed to toggle maximize:', error);
    }
  };

  const handleClose = async () => {
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
    if (e.target.closest('.titlebar-button')) return;
    
    try {
      const appWindow = await getAppWindow();
      if (appWindow) {
        await appWindow.startDragging();
      }
    } catch (error) {
      console.warn('Failed to start dragging:', error);
    }
  };

  if (!isTauri()) {
    return null;
  }

  return (
    <div
      className={`flex items-center justify-between h-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 select-none rounded-t-lg ${className}`}
      onMouseDown={handleMouseDown}
      data-tauri-drag-region
    >
      <div className="flex-1" data-tauri-drag-region />
      
      <div className="flex items-center">
        <button
          className="titlebar-button flex items-center justify-center w-10 h-10 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onClick={handleMinimize}
          title="最小化"
          data-tauri-drag-region="false"
        >
          <Minus className="h-4 w-4" />
        </button>
        
        <button
          className="titlebar-button flex items-center justify-center w-10 h-10 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onClick={handleMaximize}
          title={isMaximized ? "还原" : "最大化"}
          data-tauri-drag-region="false"
        >
          <Square className="h-4 w-4" />
        </button>
        
        <button
          className="titlebar-button flex items-center justify-center w-10 h-10 text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          onClick={handleClose}
          title="关闭"
          data-tauri-drag-region="false"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;