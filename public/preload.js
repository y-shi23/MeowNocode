import { contextBridge, ipcRenderer } from 'electron';

// 向渲染进程暴露受保护的控制API
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-maximize')
  },

  // 菜单事件监听
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-new-memo', callback);
    ipcRenderer.on('menu-export-data', (_, path) => callback('export-data', path));
    ipcRenderer.on('menu-import-data', (_, path) => callback('import-data', path));
    ipcRenderer.on('menu-toggle-canvas', callback);
  },

  // 移除监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // 平台信息
  platform: process.platform,

  // 开发环境检测
  isDev: process.env.NODE_ENV === 'development'
});

// 设置全局变量，禁用云端功能
contextBridge.exposeInMainWorld('electronConfig', {
  isDesktop: true,
  disableCloudSync: true,
  enableLocalStorage: true
});