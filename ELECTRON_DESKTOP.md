# MeowNocode 桌面端应用

## 配置说明

该应用已配置为支持Electron桌面端打包，主要特性包括：

### 1. 无边框窗口样式
- 使用自定义标题栏组件 (`DesktopTitleBar`)
- 支持窗口最小化、最大化、关闭操作
- 标题栏区域支持拖拽移动窗口

### 2. 桌面端专属配置
- **禁用云端数据库**: Cloudflare D1 和 Supabase 功能在桌面端已被禁用
- **保留S3服务**: 文件存储服务（如AWS S3、Cloudflare R2等）保持可用
- **本地存储优先**: 所有数据默认保存在本地localStorage中

### 3. 开发命令

```bash
# 开发模式运行
npm run electron-dev

# 构建桌面应用
npm run electron-build

# 仅构建Windows版本
npm run electron-build:win

# 构建并打包所有平台
npm run dist
```

### 4. 构建输出

打包后的应用将输出到 `dist-electron/` 目录：
- Windows: `.exe` 安装程序
- macOS: `.dmg` 镜像文件
- Linux: `.AppImage` 可执行文件

### 5. 桌面端功能

#### 窗口控制
- 自定义标题栏按钮（最小化、最大化、关闭）
- 支持键盘快捷键：
  - `Ctrl+N`: 新建便签
  - `Ctrl+\`: 切换画布模式
  - `Ctrl+Q`: 退出应用

#### 菜单功能
- **文件菜单**: 新建便签、导入/导出数据、退出
- **编辑菜单**: 标准文本编辑操作（撤销、重做、剪切、复制、粘贴等）
- **视图菜单**: 切换画布模式、刷新、开发者工具等
- **帮助菜单**: 关于信息

#### 数据管理
- 桌面端数据完全保存在本地
- 支持数据导入/导出功能
- 云端同步功能已禁用，确保数据隐私

### 6. 注意事项

1. **网页部署兼容性**: 所有Electron相关配置都不会影响原有的网页部署功能
2. **环境检测**: 应用会自动检测是否在桌面端环境中运行
3. **S3配置**: S3存储服务配置保持不变，可用于文件备份和共享
4. **性能优化**: 桌面端版本相比网页版本具有更好的本地性能

### 7. 故障排除

如果在Linux环境中运行遇到依赖库问题，可能需要安装：
```bash
# Ubuntu/Debian
sudo apt-get install libnspr4 libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 libasound2

# CentOS/RHEL
sudo yum install nss atk atk-bridge2.0 gtk3 libXrandr libXcomposite libXdamage libXss libgbm
```

### 8. 开发建议

- 修改 `public/electron.js` 来调整窗口行为
- 修改 `src/components/DesktopTitleBar.jsx` 来自定义标题栏样式
- 修改 `src/lib/d1.js` 来调整云端服务的桌面端行为