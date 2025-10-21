# Meow App

Meow App 是一个使用 React 与 Tauri 构建的桌面笔记应用，支持本地离线使用，并可通过对象存储（S3/R2 兼容）进行云端同步。

## 主要特性
- 便捷的笔记记录与标签管理
- 可选择的画布模式、音乐播放与多媒体附件
- 本地优先的数据存储，结合 S3 进行增量同步
- 自定义主题、快捷键及丰富的外观设置

## 云同步（S3）
1. 在应用设置的“数据”页中填写对象存储的 Endpoint、Access Key、Secret 等信息，并启用 S3。
2. 开启“云同步”开关后，数据会定期推送到指定的存储桶，同时也会从云端拉取并合并其他设备的改动。
3. 支持 Cloudflare R2、Amazon S3 以及兼容的 MinIO 服务。

> ⚠️ 建议为存储桶启用私有访问，并通过自定义域名或临时凭证提供访问能力。

## 本地开发
```bash
npm install
npm run dev
```

## 构建
```bash
npm run build
```

## 目录结构
- `src/` 前端源码
- `src-tauri/` Tauri 桌面端配置
- `functions/` 其它 Cloudflare Pages Functions（如代理、同步工具）
- `public/` 静态资源

## 许可证
本项目基于 MIT License 发布。
