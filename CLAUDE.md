# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言偏好

用户偏好使用中文交流。所有文档、代码注释、提交信息优先使用中文。

## 常用命令

```bash
# 编译（类型检查 + lint + esbuild 打包）
pnpm compile

# 监听模式开发
pnpm watch

# 仅类型检查
pnpm check-types

# 仅 lint
pnpm lint

# 运行测试
pnpm test

# 生产构建（压缩）
pnpm package
```

## 架构概览

这是一个 VS Code 扩展，将剪贴板中的图片上传到 S3 兼容存储（MinIO），并将返回 URL 插入编辑器光标位置。

### 模块职责

```
src/
├── extension.ts          # 入口：注册命令和 Provider
├── config.ts             # 纯函数，读取 VS Code 配置，提供默认值
├── s3Client.ts           # 单例，封装 @aws-sdk/client-s3 的 PutObject
├── pathGenerator.ts      # 纯函数，模板字符串 {year}/{month}/{md5}.{ext} 替换
├── urlBuilder.ts         # 纯函数，urlPrefix 改写 + url/markdown 格式化
├── pasteCommand.ts       # 编排层，拦截 editor.action.clipboardPasteAction
└── imageUtils.ts         # 纯工具：读剪贴板、MD5、魔数检测扩展名
```

### 数据流

`Ctrl+V` → 拦截粘贴命令 → 读剪贴板图片 → 计算 MD5 → 生成路径模板 → S3 上传 → urlPrefix 改写 → 格式化 url/markdown → 插入编辑器

### 核心设计决策

- **粘贴拦截**：覆盖 `editor.action.clipboardPasteAction`，有图片则上传，无图片回退到默认粘贴
- **S3 SDK**：使用 `@aws-sdk/client-s3`，配合 `forcePathStyle: true` 支持 MinIO
- **文件命名**：MD5 内容哈希，天然去重
- **URL 前缀**：`urlPrefix` 配置项实现内网 endpoint → 公网 URL 的映射
- **URL 格式**：`auto` 模式根据文件类型自动选择 — `.md`/`.mdx` 用 `![](url)`，其余用纯 URL
- **V1 范围**：仅粘贴上传；拖拽和撤销推迟到 V2

### 构建

- 使用 esbuild 打包为单个 `dist/extension.js`（CJS 格式）
- `vscode` 设为 external，由 VS Code 运行时提供
- TypeScript 目标 ES2022，模块 Node16
- 包管理使用 pnpm

### 完整设计文档

`docs/superpowers/specs/2026-07-13-paste-image-to-s3-design.md`
