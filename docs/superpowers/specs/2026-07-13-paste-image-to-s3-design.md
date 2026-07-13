# VSCode 粘贴图片到 S3 — 设计规格

**日期**: 2026-07-13
**状态**: 已确认
**版本**: V1

---

## 1. 概述

一款 VS Code 扩展，将剪贴板中的图片（截图）自动上传到 S3 兼容存储服务，并在编辑器光标位置插入返回的 URL。支持纯 URL 和 Markdown `![](url)` 两种格式。

### 目标

- 无缝截图转 URL 工作流：剪贴板有图片时 Ctrl+V 自动触发上传
- 支持自建 MinIO / S3 兼容服务的自定义 endpoint 配置
- 基于模板占位符的灵活路径生成
- URL 前缀改写（内网 endpoint → 对外可访问的公网 URL）
- 基于 MD5 内容哈希的去重命名

### 非目标（V1 不做）

- 拖拽图片文件上传（推迟到 V2）
- Ctrl+Z 撤销删除已上传图片（推迟到 V2）

---

## 2. 配置项

所有设置通过 `package.json` → `contributes.configuration` 注册，可在 VS Code 设置界面中编辑。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `pasteImageToS3.endpoint` | `string` | `""` | S3 服务端点，如 `http://192.168.1.100:9000` |
| `pasteImageToS3.bucket` | `string` | `""` | S3 存储桶名称 |
| `pasteImageToS3.accessKeyId` | `string` | `""` | S3 Access Key ID |
| `pasteImageToS3.secretAccessKey` | `string` | `""` | S3 Secret Access Key |
| `pasteImageToS3.region` | `string` | `"us-east-1"` | S3 区域（SDK 必填，MinIO 忽略实际值） |
| `pasteImageToS3.urlPrefix` | `string` | `""` | 返回 URL 的前缀。例如 endpoint = `http://192.168.1.100:9000`，urlPrefix = `https://cdn.example.com` → 返回 `https://cdn.example.com/{path}` |
| `pasteImageToS3.pathTemplate` | `string` | `"{year}/{month}/{md5}.{ext}"` | 上传路径模板，支持占位符 |
| `pasteImageToS3.urlFormat` | `enum` | `"auto"` | `"url"` — 纯 URL；`"markdown"` — `![](url)`；`"auto"` — `.md`/`.mdx` 文件用 markdown，其余用纯 URL |
| `pasteImageToS3.forcePathStyle` | `boolean` | `true` | 使用路径风格寻址（MinIO 必须开启） |
| `pasteImageToS3.useSsl` | `boolean` | `true` | 是否使用 HTTPS 连接 S3 |

### 路径模板占位符

| 占位符 | 示例 | 说明 |
|--------|------|------|
| `{bucket}` | `my-bucket` | 配置中的存储桶名称 |
| `{year}` | `2026` | 当前年份 UTC |
| `{month}` | `07` | 当前月份 UTC，2 位补零 |
| `{day}` | `13` | 当前日期 UTC，2 位补零 |
| `{md5}` | `a1b2c3d4...` | 图片二进制内容的 MD5 哈希（32 位十六进制） |
| `{ext}` | `png` | 根据图片格式推导的扩展名 |
| `{filename}` | `screenshot` | 原始文件名（若有），否则为 `image` |

---

## 3. 架构

### 模块结构

```
src/
├── extension.ts          # 入口：activate/deactivate
├── config.ts             # 配置读取与校验
├── s3Client.ts           # S3 客户端封装 (@aws-sdk/client-s3)
├── pathGenerator.ts      # 路径模板 → S3 对象键
├── urlBuilder.ts         # URL 前缀改写 + 格式化
├── pasteCommand.ts       # 粘贴命令拦截编排
└── imageUtils.ts         # 剪贴板读取、MD5 计算、扩展名检测
```

### 数据流

```
用户按下 Ctrl+V
        │
        ▼
  pasteCommand 拦截 editor.action.clipboardPasteAction
        │
        ▼
  imageUtils.readClipboardImage()
        │
        ├── 无图片 → executeCommand('default:editor.action.clipboardPasteAction')（回退到默认粘贴）
        │
        └── 有图片 → 二进制数据
                │
                ▼
        imageUtils.computeMd5(buffer)
                │
                ▼
        pathGenerator.generate(template, context)
                │
                ▼
        s3Client.upload(bucket, key, buffer, contentType)
                │
                ▼
        urlBuilder.build(s3Key, urlPrefix, format, fileType)
                │
                ▼
        editor.edit(在光标处插入 URL)
```

### 模块职责

- **config.ts** — 纯函数，读取 VS Code 工作区配置，提供默认值和校验。不依赖项目中其他模块。
- **imageUtils.ts** — 纯工具函数：通过 VS Code 剪贴板 API 读取图片、计算 MD5 哈希、根据文件魔数检测扩展名。仅依赖剪贴板 API。
- **pathGenerator.ts** — 纯函数：字符串模板替换 `{占位符}`。无副作用。
- **urlBuilder.ts** — 纯函数：根据 S3 键构造最终 URL，应用前缀改写，格式化为纯 URL 或 Markdown。无副作用。
- **s3Client.ts** — 单例封装 `@aws-sdk/client-s3`。根据配置创建 S3 客户端，对外暴露 `upload()` 方法。单一职责：S3 通信。
- **pasteCommand.ts** — 编排层。注册命令拦截，协调整个流程。依赖所有其他模块。

---

## 4. 粘贴拦截

通过 `vscode.commands.registerTextEditorCommand` 覆盖 `editor.action.clipboardPasteAction`。

```ts
vscode.commands.registerTextEditorCommand(
  'editor.action.clipboardPasteAction',
  async (editor) => {
    const image = await readClipboardImage();
    if (!image) {
      // 无图片 — 回退到默认粘贴
      return vscode.commands.executeCommand(
        'default:editor.action.clipboardPasteAction'
      );
    }

    try {
      const url = await uploadAndBuildUrl(image);
      await editor.edit(eb => eb.insert(editor.selection.active, url));
    } catch (err) {
      // 错误按下方表格处理；编辑器内容不变
    }
  }
);
```

---

## 5. 错误处理

| 场景 | 处理方式 |
|------|----------|
| 剪贴板无图片 | 静默回退到默认粘贴 |
| S3 连接失败 | `showErrorMessage` 显示原因，编辑器内容不变 |
| 凭证无效 (403) | "S3 认证失败，请检查 Access Key 配置" |
| 存储桶不存在 (404) | "存储桶不存在，请检查配置中的 bucket 名称" |
| 上传超时 | "上传超时，请检查网络连接" |
| 图片过大 (>50MB) | "图片过大 (X MB)，最大支持 50 MB" — 上传前检查 |
| 配置缺失 (endpoint/bucket/key) | 首次使用时警告，附带跳转到设置页的按钮 |
| 不支持的文件格式（拖拽） | 非图片文件静默忽略 |
| 上传成功 | 无提示 — URL 直接出现在光标位置 |
| 上传进行中 | 状态栏显示：`$(cloud-upload) 上传中...` |
| 上传失败 | 状态栏显示：`$(error) 上传失败`（点击查看详情） |

---

## 6. 依赖

### 运行时

- `@aws-sdk/client-s3` — S3 SDK

### 开发时

- 现有 `package.json` 中的 devDependencies 已满足需求：
  - `typescript`, `esbuild`, `eslint`, `@types/vscode`, `@types/node`, `@vscode/test-cli`, `@vscode/test-electron`, `mocha`

---

## 7. 测试策略

| 模块 | 方式 | 范围 |
|------|------|------|
| `pathGenerator.ts` | 单元测试 | 所有占位符、边界情况（空模板、未知占位符） |
| `urlBuilder.ts` | 单元测试 | urlPrefix 有无尾部斜杠、纯 URL 与 Markdown 格式化 |
| `imageUtils.ts` | 单元测试 | MD5 已知向量、根据魔数检测扩展名 |
| `config.ts` | 单元测试 | 默认值、缺失配置、无效枚举值 |
| `s3Client.ts` | 集成测试 | Mock S3 SDK；验证客户端构造参数和上传参数 |
| `pasteCommand.ts` | E2E 测试 | Extension Test Runner：启动 VS Code 实例，模拟带图片的粘贴 |

---

## 8. V2 路线图（不在当前范围）

- **拖拽支持** — `DocumentDropEditProvider`，将图片文件从文件管理器拖入编辑器自动上传
- **撤销支持** — Ctrl+Z 删除已上传的 S3 对象并移除插入的 URL
