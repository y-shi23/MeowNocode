import React, { useEffect } from 'react';
import { toast } from 'sonner';

const DesktopConfigCheck = () => {
  useEffect(() => {
    // 检查是否为桌面端环境
    if (window.electronConfig?.isDesktop) {
      console.log('桌面端环境已检测到');

      // 设置桌面端标识到localStorage
      localStorage.setItem('desktopMode', 'true');
      localStorage.setItem('cloudSyncDisabled', 'true');

      // 确保S3配置保持可用
      const currentS3Config = JSON.parse(localStorage.getItem('s3Config') || '{}');
      if (currentS3Config.enabled === undefined) {
        // 如果没有S3配置，设置默认配置
        const defaultS3Config = {
          enabled: false,
          endpoint: '',
          accessKeyId: '',
          secretAccessKey: '',
          bucket: '',
          region: 'auto',
          publicUrl: '',
          provider: 'r2'
        };
        localStorage.setItem('s3Config', JSON.stringify(defaultS3Config));
      }

      // 显示桌面端提示
      toast.success('桌面端模式已启用', {
        description: '云端同步功能已禁用，数据将保存在本地',
        duration: 3000
      });

      // 监听菜单事件
      if (window.electronAPI?.onMenuAction) {
        window.electronAPI.onMenuAction((action, data) => {
          switch (action) {
            case 'menu-new-memo':
              // 触发新建便签功能
              window.dispatchEvent(new CustomEvent('new-memo'));
              break;
            case 'export-data':
              // 触发数据导出功能
              window.dispatchEvent(new CustomEvent('export-data', { detail: data }));
              break;
            case 'import-data':
              // 触发数据导入功能
              window.dispatchEvent(new CustomEvent('import-data', { detail: data }));
              break;
            case 'toggle-canvas':
              // 触发画布模式切换
              window.dispatchEvent(new CustomEvent('toggle-canvas'));
              break;
            default:
              break;
          }
        });
      }
    }
  }, []);

  return null; // 这个组件不需要渲染任何UI
};

export default DesktopConfigCheck;