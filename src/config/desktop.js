// 桌面端配置文件
// 禁用云端功能，确保S3服务可用

export const DESKTOP_CONFIG = {
  // 桌面端标识
  isDesktop: true,

  // 禁用云端数据库
  cloudSync: {
    enabled: false,
    d1Enabled: false,
    supabaseEnabled: false
  },

  // 启用本地存储
  localStorage: {
    enabled: true,
    databasePath: './data/meownocode-desktop.db'
  },

  // S3配置保持可用
  s3Storage: {
    enabled: true,
    providers: ['r2', 's3', 'minio', 'qiniu', 'tencent']
  },

  // 桌面端特定功能
  desktop: {
    framelessWindow: true,
    nativeMenu: true,
    systemTray: false,
    autoUpdate: false
  }
};

// 检测是否为桌面端环境
export const isDesktop = () => {
  return window.electronConfig?.isDesktop || false;
};

// 获取桌面端配置
export const getDesktopConfig = () => {
  return DESKTOP_CONFIG;
};