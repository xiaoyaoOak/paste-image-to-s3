# Paste Image to S3

将剪贴板中的图片自动上传到 S3 兼容存储，并在编辑器光标位置返回访问 URL。

## 功能

- **粘贴即上传**：截图后 Ctrl+V，图片自动上传到 S3 并回写 URL
- **多来源支持**：截图软件截屏、浏览器右键复制图片、文件管理器 Ctrl+C 复制图片文件均可识别
- **Markdown / 纯 URL 自动切换**：`.md` / `.mdx` 文件中自动输出 `![](url)`，其他文件输出纯 URL
- **MD5 去重**：基于内容哈希命名，相同图片只存储一份
- **路径模板**：支持 `{year}/{month}/{md5}.{ext}` 等占位符自定义存储路径
- **URL 前缀改写**：内网 endpoint + 公网 urlPrefix，灵活适配 CDN 场景

## 使用方式

1. 配置 S3 服务信息（见下方配置说明）
2. 截图或复制图片到剪贴板
3. 在编辑器中按 **Ctrl+V**
4. 光标处短暂显示 ⌛ 沙漏，上传完成后自动替换为 URL

支持以下剪贴板来源：

| 来源 | 方式 | 说明 |
|------|------|------|
| 截图软件 | Ctrl+V 粘贴 | 自动识别剪贴板图片二进制 |
| 浏览器 | 右键 → 复制图片 → Ctrl+V | 同上 |
| 文件管理器 | 选中图片 Ctrl+C → Ctrl+V | 读取文件内容上传 |
| 右键地址复制 | 复制图片路径 → Ctrl+V | 识别路径指向图片文件 |

## 扩展配置

扩展提供以下配置项（`设置 → 扩展 → Paste Image to S3`）：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `pasteImageToS3.endpoint` | string | `""` | S3 服务端点，如 `http://192.168.1.100:9000` |
| `pasteImageToS3.bucket` | string | `""` | 存储桶名称 |
| `pasteImageToS3.accessKeyId` | string | `""` | Access Key ID |
| `pasteImageToS3.secretAccessKey` | string | `""` | Secret Access Key |
| `pasteImageToS3.region` | string | `"us-east-1"` | 区域标识（MinIO 可忽略） |
| `pasteImageToS3.urlPrefix` | string | `""` | 对外访问 URL 前缀。如内网 endpoint 为 `http://192.168.1.100:9000`，设置为 `https://cdn.example.com/bucket` 后返回公网 URL |
| `pasteImageToS3.pathTemplate` | string | `"{year}/{month}/{md5}.{ext}"` | 上传路径模板 |
| `pasteImageToS3.urlFormat` | enum | `"auto"` | 输出格式：`url` 纯链接 / `markdown` `![](url)` / `auto` 自动检测 |
| `pasteImageToS3.forcePathStyle` | boolean | `true` | 路径风格寻址（MinIO 必须开启） |
| `pasteImageToS3.useSsl` | boolean | `true` | 是否使用 HTTPS 连接 |

### 路径模板占位符

| 占位符 | 示例 | 说明 |
|--------|------|------|
| `{bucket}` | `my-bucket` | 配置中的存储桶名称 |
| `{year}` | `2026` | 当前年份（UTC） |
| `{month}` | `07` | 当前月份，2 位补零 |
| `{day}` | `13` | 当前日期，2 位补零 |
| `{md5}` | `a1b2c3d4...` | 图片内容的 MD5 哈希（32 位） |
| `{ext}` | `png` | 图片格式对应的扩展名 |
| `{filename}` | `image` | 原文件名（默认 `image`） |

## 支持的图片格式

PNG、JPEG、GIF、WebP、BMP、TIFF、SVG（仅文件路径方式）

## 系统要求

- VS Code `^1.102.0` 及以上
- S3 兼容存储服务（AWS S3 / MinIO / 阿里云 OSS / 腾讯云 COS 等）

## 已知问题

- Windows 剪贴板读取依赖 PowerShell，首次粘贴有约 200-300ms 启动延迟
- Ctrl+Z 无法撤销已上传的图片（S3 对象仍保留）

## 开发

```bash
pnpm install        # 安装依赖
pnpm compile        # 编译（类型检查 + lint + esbuild）
pnpm watch          # 监听模式
pnpm test           # 运行测试
```

按 **F5** 启动扩展开发窗口进行调试。

## 许可

MIT
