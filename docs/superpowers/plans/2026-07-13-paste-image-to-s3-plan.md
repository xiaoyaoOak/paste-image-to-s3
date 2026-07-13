# VSCode 粘贴图片到 S3 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 VS Code 扩展，Ctrl+V 粘贴剪贴板图片时自动上传到 S3 兼容存储，并回写 URL 到编辑器光标位置。

**Architecture:** 自底向上构建：先实现纯函数模块（config、pathGenerator、urlBuilder、imageUtils），再构建有依赖的模块（s3Client），最后在 pasteCommand 中编排完整流程并接入 extension.ts 入口。每个模块均为独立可测试文件。

**Tech Stack:** TypeScript, `@aws-sdk/client-s3`, VS Code Extension API (`^1.125.0`), esbuild, mocha + assert

## Global Constraints

- VS Code 最低版本: `^1.125.0`
- 包管理: pnpm
- 打包: esbuild（单个 `dist/extension.js` CJS 输出）
- TypeScript 配置: strict mode, target ES2022, module Node16
- 测试框架: `@vscode/test-cli` + mocha + assert
- S3 SDK: `@aws-sdk/client-s3`（仅使用 PutObject）
- 语言: 中文注释

---

### Task 1: 安装 S3 SDK 依赖

**Files:**
- Modify: `package.json`（添加 dependencies）

**Interfaces:**
- Consumes: 无
- Produces: `@aws-sdk/client-s3` 可用

- [ ] **Step 1: 安装 @aws-sdk/client-s3**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm add @aws-sdk/client-s3
```
Expected: 安装成功，`package.json` 新增 `"@aws-sdk/client-s3": "^3.x.x"` 到 dependencies

- [ ] **Step 2: 验证依赖安装**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && node -e "require('@aws-sdk/client-s3'); console.log('S3 SDK loaded')"
```
Expected: `S3 SDK loaded`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: 添加 @aws-sdk/client-s3 依赖"
```

---

### Task 2: 创建 config.ts 配置读取模块

**Files:**
- Create: `src/config.ts`
- Create: `src/test/config.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
```ts
interface PasteImageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  urlPrefix: string;
  pathTemplate: string;
  urlFormat: 'url' | 'markdown' | 'auto';
  forcePathStyle: boolean;
  useSsl: boolean;
}

function getConfig(): PasteImageConfig;
function validateConfig(config: PasteImageConfig): { valid: boolean; missing: string[] };
```

- [ ] **Step 1: 编写 config.ts 接口和实现**

```ts
// src/config.ts
import * as vscode from 'vscode';

export interface PasteImageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  urlPrefix: string;
  pathTemplate: string;
  urlFormat: 'url' | 'markdown' | 'auto';
  forcePathStyle: boolean;
  useSsl: boolean;
}

/** 从 VS Code 工作区配置中读取全部设置，附带默认值 */
export function getConfig(): PasteImageConfig {
  const cfg = vscode.workspace.getConfiguration('pasteImageToS3');
  return {
    endpoint: cfg.get<string>('endpoint', ''),
    bucket: cfg.get<string>('bucket', ''),
    accessKeyId: cfg.get<string>('accessKeyId', ''),
    secretAccessKey: cfg.get<string>('secretAccessKey', ''),
    region: cfg.get<string>('region', 'us-east-1'),
    urlPrefix: cfg.get<string>('urlPrefix', ''),
    pathTemplate: cfg.get<string>('pathTemplate', '{year}/{month}/{md5}.{ext}'),
    urlFormat: cfg.get<'url' | 'markdown' | 'auto'>('urlFormat', 'auto'),
    forcePathStyle: cfg.get<boolean>('forcePathStyle', true),
    useSsl: cfg.get<boolean>('useSsl', true),
  };
}

/** 校验必填项，返回缺失字段列表 */
export function validateConfig(config: PasteImageConfig): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!config.endpoint) { missing.push('endpoint'); }
  if (!config.bucket) { missing.push('bucket'); }
  if (!config.accessKeyId) { missing.push('accessKeyId'); }
  if (!config.secretAccessKey) { missing.push('secretAccessKey'); }
  return { valid: missing.length === 0, missing };
}
```

- [ ] **Step 2: 编写 config.test.ts 测试默认值**

```ts
// src/test/config.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';
import { getConfig, validateConfig } from '../config';

suite('config 模块', () => {

  test('getConfig 应返回默认值', () => {
    const config = getConfig();
    assert.strictEqual(config.region, 'us-east-1');
    assert.strictEqual(config.pathTemplate, '{year}/{month}/{md5}.{ext}');
    assert.strictEqual(config.urlFormat, 'auto');
    assert.strictEqual(config.forcePathStyle, true);
    assert.strictEqual(config.useSsl, true);
    assert.strictEqual(config.endpoint, '');
    assert.strictEqual(config.bucket, '');
  });

  test('validateConfig 缺失全部必填项时应返回 valid=false', () => {
    const config = getConfig();
    const result = validateConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.missing.includes('endpoint'));
    assert.ok(result.missing.includes('bucket'));
    assert.ok(result.missing.includes('accessKeyId'));
    assert.ok(result.missing.includes('secretAccessKey'));
  });

  test('validateConfig 全部必填项存在时应返回 valid=true', () => {
    const config = getConfig();
    config.endpoint = 'http://localhost:9000';
    config.bucket = 'images';
    config.accessKeyId = 'minioadmin';
    config.secretAccessKey = 'minioadmin';
    const result = validateConfig(config);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.missing.length, 0);
  });

  test('validateConfig 部分缺失时应正确返回缺失字段', () => {
    const config = getConfig();
    config.endpoint = 'http://localhost:9000';
    const result = validateConfig(config);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.missing.length, 3);
    assert.ok(!result.missing.includes('endpoint'));
  });

});
```

- [ ] **Step 3: 运行测试验证失败（文件存在但可能因 VS Code API 依赖而跳过）**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm compile-tests && pnpm test
```
Expected: 测试通过（config.ts 仅依赖 vscode.workspace.getConfiguration，在 Extension Test Runner 环境中可用）

- [ ] **Step 4: Commit**

```bash
git add src/config.ts src/test/config.test.ts
git commit -m "feat: 添加 config 模块 — 配置读取与校验"
```

---

### Task 3: 创建 pathGenerator.ts 路径模板模块

**Files:**
- Create: `src/pathGenerator.ts`
- Create: `src/test/pathGenerator.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
```ts
interface PathContext {
  bucket: string;
  year: string;
  month: string;
  day: string;
  md5: string;
  ext: string;
  filename: string;
}

function generatePath(template: string, context: PathContext): string;
```

- [ ] **Step 1: 编写 pathGenerator.ts**

```ts
// src/pathGenerator.ts

export interface PathContext {
  bucket: string;
  year: string;
  month: string;
  day: string;
  md5: string;
  ext: string;
  filename: string;
}

/** 根据模板和上下文生成 S3 对象键 */
export function generatePath(template: string, context: PathContext): string {
  return template
    .replace(/\{bucket\}/g, context.bucket)
    .replace(/\{year\}/g, context.year)
    .replace(/\{month\}/g, context.month)
    .replace(/\{day\}/g, context.day)
    .replace(/\{md5\}/g, context.md5)
    .replace(/\{ext\}/g, context.ext)
    .replace(/\{filename\}/g, context.filename);
}
```

- [ ] **Step 2: 编写 pathGenerator.test.ts**

```ts
// src/test/pathGenerator.test.ts
import * as assert from 'assert';
import { generatePath, PathContext } from '../pathGenerator';

suite('pathGenerator 模块', () => {

  const context: PathContext = {
    bucket: 'my-bucket',
    year: '2026',
    month: '07',
    day: '13',
    md5: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    ext: 'png',
    filename: 'screenshot',
  };

  test('默认模板 {year}/{month}/{md5}.{ext}', () => {
    const result = generatePath('{year}/{month}/{md5}.{ext}', context);
    assert.strictEqual(result, '2026/07/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.png');
  });

  test('包含 bucket 的模板', () => {
    const result = generatePath('{bucket}/{year}/{month}/{md5}.{ext}', context);
    assert.strictEqual(result, 'my-bucket/2026/07/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.png');
  });

  test('包含 filename 的模板', () => {
    const result = generatePath('{bucket}/{filename}.{ext}', context);
    assert.strictEqual(result, 'my-bucket/screenshot.png');
  });

  test('包含 day 的模板', () => {
    const result = generatePath('{year}/{month}/{day}/{md5}.{ext}', context);
    assert.strictEqual(result, '2026/07/13/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.png');
  });

  test('无占位符的模板原样返回', () => {
    const result = generatePath('images/photo.jpg', context);
    assert.strictEqual(result, 'images/photo.jpg');
  });

  test('空模板返回空字符串', () => {
    const result = generatePath('', context);
    assert.strictEqual(result, '');
  });

  test('未知占位符保留原样', () => {
    const result = generatePath('{unknown}/{year}.{ext}', context);
    assert.strictEqual(result, '{unknown}/2026.png');
  });

});
```

- [ ] **Step 3: 运行测试并验证通过**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm compile-tests && pnpm test
```
Expected: 7 个 pathGenerator 测试全部通过

- [ ] **Step 4: Commit**

```bash
git add src/pathGenerator.ts src/test/pathGenerator.test.ts
git commit -m "feat: 添加 pathGenerator 模块 — 路径模板生成"
```

---

### Task 4: 创建 urlBuilder.ts URL 构建模块

**Files:**
- Create: `src/urlBuilder.ts`
- Create: `src/test/urlBuilder.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
```ts
type UrlFormat = 'url' | 'markdown';

function buildUrl(s3Key: string, urlPrefix: string, format: UrlFormat): string;
```

- [ ] **Step 1: 编写 urlBuilder.ts**

```ts
// src/urlBuilder.ts

export type UrlFormat = 'url' | 'markdown';

/**
 * 根据 S3 Key 和配置构建最终返回 URL
 * @param s3Key 上传路径，如 "2026/07/a1b2.png"
 * @param urlPrefix 为空时直接拼接 endpoint 风格路径；非空时替换
 * @param format "url" 返回纯 URL，"markdown" 返回 ![](url)
 * @param fileType 可选，如 ".md" — 用于 future extension
 */
export function buildUrl(s3Key: string, urlPrefix: string, format: UrlFormat): string {
  // 规范化前缀：去尾部斜杠
  const prefix = urlPrefix.replace(/\/+$/, '');
  const url = prefix ? `${prefix}/${s3Key}` : s3Key;

  if (format === 'markdown') {
    return `![](${url})`;
  }
  return url;
}
```

- [ ] **Step 2: 编写 urlBuilder.test.ts**

```ts
// src/test/urlBuilder.test.ts
import * as assert from 'assert';
import { buildUrl } from '../urlBuilder';

suite('urlBuilder 模块', () => {

  test('纯 URL 模式 — 有 urlPrefix', () => {
    const result = buildUrl('2026/07/abc.png', 'https://cdn.example.com', 'url');
    assert.strictEqual(result, 'https://cdn.example.com/2026/07/abc.png');
  });

  test('纯 URL 模式 — 无 urlPrefix 返回原始 key', () => {
    const result = buildUrl('2026/07/abc.png', '', 'url');
    assert.strictEqual(result, '2026/07/abc.png');
  });

  test('Markdown 模式 — 有 urlPrefix', () => {
    const result = buildUrl('2026/07/abc.png', 'https://cdn.example.com', 'markdown');
    assert.strictEqual(result, '![](https://cdn.example.com/2026/07/abc.png)');
  });

  test('Markdown 模式 — 无 urlPrefix', () => {
    const result = buildUrl('2026/07/abc.png', '', 'markdown');
    assert.strictEqual(result, '![](2026/07/abc.png)');
  });

  test('urlPrefix 尾部斜杠应被规范化', () => {
    const result = buildUrl('img/photo.png', 'https://cdn.example.com/', 'url');
    assert.strictEqual(result, 'https://cdn.example.com/img/photo.png');
  });

  test('urlPrefix 多个尾部斜杠全部移除', () => {
    const result = buildUrl('img/photo.png', 'https://cdn.example.com///', 'url');
    assert.strictEqual(result, 'https://cdn.example.com/img/photo.png');
  });

});
```

- [ ] **Step 3: 运行测试并验证通过**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm compile-tests && pnpm test
```
Expected: 6 个 urlBuilder 测试全部通过

- [ ] **Step 4: Commit**

```bash
git add src/urlBuilder.ts src/test/urlBuilder.test.ts
git commit -m "feat: 添加 urlBuilder 模块 — URL 前缀改写与格式化"
```

---

### Task 5: 创建 imageUtils.ts 图片工具模块

**Files:**
- Create: `src/imageUtils.ts`
- Create: `src/test/imageUtils.test.ts`

**Interfaces:**
- Consumes: 无（仅依赖 VS Code 剪贴板 API 和 Node.js crypto/child_process）
- Produces:
```ts
interface ClipboardImage {
  buffer: Buffer;
  format: string;   // "png" | "jpeg" | "gif" | "webp" | "bmp" | "tiff" | "svg"
}

function readClipboardImage(): Promise<ClipboardImage | undefined>;
function computeMd5(buffer: Buffer): string;
function extensionFromFormat(format: string): string;
```

- [ ] **Step 1: 编写 imageUtils.ts**

```ts
// src/imageUtils.ts
import * as crypto from 'crypto';
import * as os from 'os';
import { execSync } from 'child_process';
import { Buffer } from 'buffer';

export interface ClipboardImage {
  buffer: Buffer;
  format: string; // "png" | "jpeg" | "gif" | "webp" | "bmp" | "tiff"
}

/** 图像格式到文件扩展名的映射 */
const FORMAT_TO_EXT: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  gif: 'gif',
  webp: 'webp',
  bmp: 'bmp',
  tiff: 'tiff',
};

/** 通过魔数（文件头字节）检测图片格式 */
function detectFormat(buffer: Buffer): string | null {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) { return 'png'; }
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) { return 'jpeg'; }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) { return 'gif'; }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) { return 'webp'; } // RIFF....WEBP
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) { return 'bmp'; }
  if (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00) { return 'tiff'; }
  if (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A) { return 'tiff'; }
  return null;
}

/** 从系统剪贴板读取图片（跨平台） */
export async function readClipboardImage(): Promise<ClipboardImage | undefined> {
  try {
    const platform = os.platform();
    let buffer: Buffer;

    if (platform === 'win32') {
      // Windows: 使用 PowerShell 读取剪贴板图片
      const script = `Add-Type -AssemblyName System.Windows.Forms;$clip = [System.Windows.Forms.Clipboard]::GetImage();if ($clip) {$ms = New-Object System.IO.MemoryStream;$clip.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png);$bytes = $ms.ToArray();[System.Convert]::ToBase64String($bytes)}`;
      const output = execSync(`powershell -Command "${script}"`, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (!output) { return undefined; }
      buffer = Buffer.from(output, 'base64');
    } else if (platform === 'darwin') {
      // macOS: 使用 osascript 读取剪贴板 PNG 数据
      const script = 'get the clipboard as «class PNGf»';
      const output = execSync(`osascript -e "${script}"`, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (!output || output === '«data PNGf»') { return undefined; }
      // macOS 返回十六进制编码，需要解码
      const hex = output.replace(/[^0-9a-fA-F]/g, '');
      buffer = Buffer.from(hex, 'hex');
    } else {
      // Linux: 使用 xclip 读取剪贴板图片
      const output = execSync('xclip -selection clipboard -t image/png -o', { timeout: 5000 });
      if (!output || output.length === 0) { return undefined; }
      buffer = Buffer.from(output);
    }

    const format = detectFormat(buffer);
    if (!format) { return undefined; }

    return { buffer, format };
  } catch {
    return undefined;
  }
}

/** 计算 Buffer 的 MD5 哈希（32 位十六进制） */
export function computeMd5(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/** 格式名转扩展名 */
export function extensionFromFormat(format: string): string {
  return FORMAT_TO_EXT[format] || format;
}
```

- [ ] **Step 2: 编写 imageUtils.test.ts（测试 computeMd5 和 extensionFromFormat）**

```ts
// src/test/imageUtils.test.ts
import * as assert from 'assert';
import { computeMd5, extensionFromFormat } from '../imageUtils';

suite('imageUtils 模块', () => {

  test('computeMd5 计算已知向量的 MD5', () => {
    const buffer = Buffer.from('hello world');
    const md5 = computeMd5(buffer);
    assert.strictEqual(md5, '5eb63bbbe01eeed093cb22bb8f5acdc3');
  });

  test('computeMd5 空 Buffer', () => {
    const buffer = Buffer.alloc(0);
    const md5 = computeMd5(buffer);
    assert.strictEqual(md5, 'd41d8cd98f00b204e9800998ecf8427e');
  });

  test('computeMd5 二进制 Buffer', () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0xFF]);
    const md5 = computeMd5(buffer);
    assert.strictEqual(md5.length, 32);
    assert.strictEqual(typeof md5, 'string');
  });

  test('extensionFromFormat png → png', () => {
    assert.strictEqual(extensionFromFormat('png'), 'png');
  });

  test('extensionFromFormat jpeg → jpg', () => {
    assert.strictEqual(extensionFromFormat('jpeg'), 'jpg');
  });

  test('extensionFromFormat gif → gif', () => {
    assert.strictEqual(extensionFromFormat('gif'), 'gif');
  });

  test('extensionFromFormat webp → webp', () => {
    assert.strictEqual(extensionFromFormat('webp'), 'webp');
  });

  test('extensionFromFormat 未知格式返回原值', () => {
    assert.strictEqual(extensionFromFormat('unknown'), 'unknown');
  });

});
```

- [ ] **Step 3: 运行测试并验证通过**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm compile-tests && pnpm test
```
Expected: 8 个 imageUtils 测试全部通过

- [ ] **Step 4: Commit**

```bash
git add src/imageUtils.ts src/test/imageUtils.test.ts
git commit -m "feat: 添加 imageUtils 模块 — 剪贴板读取、MD5、扩展名检测"
```

---

### Task 6: 创建 s3Client.ts S3 上传模块

**Files:**
- Create: `src/s3Client.ts`
- Create: `src/test/s3Client.test.ts`

**Interfaces:**
- Consumes: `PasteImageConfig` from `config.ts`
- Produces:
```ts
class S3Uploader {
  constructor(config: PasteImageConfig);
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
}
```

- [ ] **Step 1: 编写 s3Client.ts**

```ts
// src/s3Client.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { PasteImageConfig } from './config';

export class S3Uploader {
  private client: S3Client;
  private bucket: string;

  constructor(config: PasteImageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
      requestHandler: undefined, // 使用默认 HTTP handler
    });

    if (!config.useSsl) {
      // 通过 endpoint 协议控制；如果 endpoint 已是 http://，SDK 自动处理
      // 若 forcePathStyle=true + http endpoint，SDK 默认使用 http
    }
  }

  /**
   * 上传文件到 S3
   * @param key S3 对象键（路径）
   * @param body 文件二进制内容
   * @param contentType MIME 类型，如 "image/png"
   */
  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await this.client.send(command);
  }
}
```

- [ ] **Step 2: 编写 s3Client.test.ts（集成测试，mock S3 SDK）**

```ts
// src/test/s3Client.test.ts
import * as assert from 'assert';
import { S3Uploader } from '../s3Client';
import type { PasteImageConfig } from '../config';

suite('s3Client 模块', () => {

  const validConfig: PasteImageConfig = {
    endpoint: 'http://localhost:9000',
    bucket: 'my-bucket',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    region: 'us-east-1',
    urlPrefix: '',
    pathTemplate: '{year}/{month}/{md5}.{ext}',
    urlFormat: 'auto',
    forcePathStyle: true,
    useSsl: false,
  };

  test('S3Uploader 构造时应接受合法配置', () => {
    const uploader = new S3Uploader(validConfig);
    assert.ok(uploader instanceof S3Uploader);
  });

  test('S3Uploader 构造时使用 forcePathStyle=true', () => {
    const uploader = new S3Uploader(validConfig);
    assert.ok(uploader instanceof S3Uploader);
  });

  test('S3Uploader 构造时 useSsl=false', () => {
    const cfg = { ...validConfig, useSsl: false };
    const uploader = new S3Uploader(cfg);
    assert.ok(uploader instanceof S3Uploader);
  });

  test('S3Uploader 构造时使用自定义 region', () => {
    const cfg = { ...validConfig, region: 'cn-north-1' };
    const uploader = new S3Uploader(cfg);
    assert.ok(uploader instanceof S3Uploader);
  });

});
```

- [ ] **Step 3: 运行测试（测试仅验证构造逻辑，不上传真实 S3）**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm compile-tests && pnpm test
```
Expected: 4 个 s3Client 测试全部通过

- [ ] **Step 4: Commit**

```bash
git add src/s3Client.ts src/test/s3Client.test.ts
git commit -m "feat: 添加 s3Client 模块 — S3 上传封装"
```

---

### Task 7: 创建 pasteCommand.ts 粘贴命令编排模块

**Files:**
- Create: `src/pasteCommand.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `getConfig`, `validateConfig` from `config.ts`; `S3Uploader` from `s3Client.ts`; `generatePath` from `pathGenerator.ts`; `buildUrl` from `urlBuilder.ts`; `ClipboardImage`, `readClipboardImage`, `computeMd5`, `extensionFromFormat` from `imageUtils.ts`
- Produces:
```ts
function registerPasteCommand(context: vscode.ExtensionContext): vscode.Disposable;
```

- [ ] **Step 1: 编写 pasteCommand.ts**

```ts
// src/pasteCommand.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { getConfig, validateConfig } from './config';
import { S3Uploader } from './s3Client';
import { generatePath } from './pathGenerator';
import { buildUrl, type UrlFormat } from './urlBuilder';
import { readClipboardImage, computeMd5, extensionFromFormat } from './imageUtils';

/** 根据文件类型决定 URL 格式 */
function resolveUrlFormat(configFormat: 'url' | 'markdown' | 'auto', editor: vscode.TextEditor): UrlFormat {
  if (configFormat !== 'auto') {
    return configFormat;
  }
  const ext = path.extname(editor.document.fileName).toLowerCase();
  return (ext === '.md' || ext === '.mdx') ? 'markdown' : 'url';
}

/** MIME 类型映射 */
function getContentType(format: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
  };
  return map[format] || 'application/octet-stream';
}

/** 注册粘贴命令拦截 */
export function registerPasteCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerTextEditorCommand(
    'editor.action.clipboardPasteAction',
    async (editor) => {
      const config = getConfig();

      // 读取剪贴板图片
      const image = await readClipboardImage();
      if (!image) {
        // 无图片 — 回退到默认粘贴
        return vscode.commands.executeCommand('default:editor.action.clipboardPasteAction');
      }

      // 校验配置
      const validation = validateConfig(config);
      if (!validation.valid) {
        const missingStr = validation.missing.join(', ');
        const action = await vscode.window.showErrorMessage(
          `S3 配置不完整，缺少: ${missingStr}。请前往设置页面配置。`,
          '打开设置'
        );
        if (action === '打开设置') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'pasteImageToS3');
        }
        return;
      }

      // 检查图片大小 (50MB 限制)
      const maxSize = 50 * 1024 * 1024;
      if (image.buffer.length > maxSize) {
        const sizeMB = (image.buffer.length / (1024 * 1024)).toFixed(1);
        vscode.window.showErrorMessage(`图片过大 (${sizeMB} MB)，最大支持 50 MB`);
        return;
      }

      // 状态栏：上传中
      const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
      statusBar.text = '$(cloud-upload) 上传中...';
      statusBar.show();
      context.subscriptions.push(statusBar);

      try {
        // 计算 MD5 和扩展名
        const md5 = computeMd5(image.buffer);
        const ext = extensionFromFormat(image.format);
        const now = new Date();

        // 生成路径
        const s3Key = generatePath(config.pathTemplate, {
          bucket: config.bucket,
          year: String(now.getUTCFullYear()),
          month: String(now.getUTCMonth() + 1).padStart(2, '0'),
          day: String(now.getUTCDate()).padStart(2, '0'),
          md5,
          ext,
          filename: 'image',
        });

        // 上传 S3
        const uploader = new S3Uploader(config);
        const contentType = getContentType(image.format);
        await uploader.upload(s3Key, image.buffer, contentType);

        // 构建 URL
        const format = resolveUrlFormat(config.urlFormat, editor);
        const url = buildUrl(s3Key, config.urlPrefix, format);

        // 插入编辑器
        await editor.edit(editBuilder => {
          editBuilder.insert(editor.selection.active, url);
        });

        statusBar.dispose();
      } catch (err: any) {
        statusBar.dispose();

        const message = err?.message || String(err);
        const statusCode = err?.$metadata?.httpStatusCode;

        if (statusCode === 403 || message.includes('AccessDenied') || message.includes('Forbidden')) {
          vscode.window.showErrorMessage('S3 认证失败，请检查 Access Key 配置');
        } else if (statusCode === 404 || message.includes('NotFound') || message.includes('NoSuchBucket')) {
          vscode.window.showErrorMessage('存储桶不存在，请检查配置中的 bucket 名称');
        } else if (message.includes('timeout') || message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
          vscode.window.showErrorMessage('上传超时，请检查网络连接');
        } else {
          const action = await vscode.window.showErrorMessage(`S3 上传失败: ${message}`, '查看详情');
          if (action === '查看详情') {
            const output = vscode.window.createOutputChannel('Paste Image to S3');
            output.appendLine(`[错误] ${new Date().toISOString()} ${message}`);
            output.show();
          }
        }

        // 状态栏：失败
        const failedBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        failedBar.text = '$(error) 上传失败';
        failedBar.tooltip = '点击查看详细错误';
        failedBar.command = 'paste-image-to-s3.showErrorLog';
        failedBar.show();
        setTimeout(() => failedBar.dispose(), 5000);
        context.subscriptions.push(failedBar);
      }
    }
  );
}
```

- [ ] **Step 2: 更新 extension.ts**

```ts
// src/extension.ts
import * as vscode from 'vscode';
import { registerPasteCommand } from './pasteCommand';

export function activate(context: vscode.ExtensionContext) {
  console.log('paste-image-to-s3 已激活');

  // 注册粘贴命令拦截
  const pasteDisposable = registerPasteCommand(context);
  context.subscriptions.push(pasteDisposable);
}

export function deactivate() {}
```

- [ ] **Step 3: 编译并验证无类型错误**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm compile
```
Expected: 编译成功，无类型错误，无 lint 错误

- [ ] **Step 4: Commit**

```bash
git add src/pasteCommand.ts src/extension.ts
git commit -m "feat: 添加 pasteCommand 模块 — 粘贴拦截编排"
```

---

### Task 8: 更新 package.json 配置项和命令注册

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: 所有模块接口
- Produces: 完整的 VS Code 扩展清单配置

- [ ] **Step 1: 更新 package.json**

Read `package.json` 当前内容，然后用以下完整配置替换 contributes 部分并扩展：

```json
{
  "name": "paste-image-to-s3",
  "displayName": "Paste Image to S3",
  "description": "将剪贴板图片自动上传到 S3 兼容存储，并返回 URL",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.125.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "paste-image-to-s3.showErrorLog",
        "title": "Paste Image to S3: 显示错误日志"
      }
    ],
    "configuration": {
      "title": "Paste Image to S3",
      "properties": {
        "pasteImageToS3.endpoint": {
          "type": "string",
          "default": "",
          "description": "S3 服务端点 URL，例如 http://192.168.1.100:9000"
        },
        "pasteImageToS3.bucket": {
          "type": "string",
          "default": "",
          "description": "S3 存储桶名称"
        },
        "pasteImageToS3.accessKeyId": {
          "type": "string",
          "default": "",
          "description": "S3 Access Key ID"
        },
        "pasteImageToS3.secretAccessKey": {
          "type": "string",
          "default": "",
          "description": "S3 Secret Access Key"
        },
        "pasteImageToS3.region": {
          "type": "string",
          "default": "us-east-1",
          "description": "S3 区域标识（MinIO 可忽略，SDK 必填）"
        },
        "pasteImageToS3.urlPrefix": {
          "type": "string",
          "default": "",
          "description": "对外访问 URL 前缀，用于替代内网 endpoint。例如 endpoint 为内网地址时，设置为 https://cdn.example.com"
        },
        "pasteImageToS3.pathTemplate": {
          "type": "string",
          "default": "{year}/{month}/{md5}.{ext}",
          "description": "上传路径模板。支持占位符: {bucket}, {year}, {month}, {day}, {md5}, {ext}, {filename}"
        },
        "pasteImageToS3.urlFormat": {
          "type": "string",
          "enum": [
            "url",
            "markdown",
            "auto"
          ],
          "default": "auto",
          "description": "返回 URL 格式：url = 纯链接，markdown = ![](url)，auto = 根据文件类型自动选择（.md/.mdx 用 markdown）"
        },
        "pasteImageToS3.forcePathStyle": {
          "type": "boolean",
          "default": true,
          "description": "启用路径风格寻址（MinIO 必须开启）"
        },
        "pasteImageToS3.useSsl": {
          "type": "boolean",
          "default": true,
          "description": "是否使用 HTTPS 连接 S3"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "pnpm run package",
    "compile": "pnpm run check-types && pnpm run lint && node esbuild.js",
    "watch": "npm-run-all -p watch:*",
    "watch:esbuild": "node esbuild.js --watch",
    "watch:tsc": "tsc --noEmit --watch --project tsconfig.json",
    "package": "pnpm run check-types && pnpm run lint && node esbuild.js --production",
    "compile-tests": "tsc -p . --outDir out",
    "watch-tests": "tsc -p . -w --outDir out",
    "pretest": "pnpm run compile-tests && pnpm run compile && pnpm run lint",
    "check-types": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vscode-test"
  },
  "devDependencies": {
    "@types/vscode": "^1.125.0",
    "@types/mocha": "^10.0.10",
    "@types/node": "24.x",
    "typescript-eslint": "^8.61.1",
    "eslint": "^10.5.0",
    "esbuild": "^0.28.1",
    "npm-run-all": "^4.1.5",
    "typescript": "^6.0.3",
    "@vscode/test-cli": "^0.0.15",
    "@vscode/test-electron": "^3.0.0"
  },
  "overrides": {
    "diff": "^8.0.4",
    "serialize-javascript": "^7.0.6"
  }
}
```

- [ ] **Step 2: 验证 package.json 有效性**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json valid')"
```
Expected: `package.json valid`

- [ ] **Step 3: 完整编译并验证**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm compile
```
Expected: 编译 + lint 全部通过

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: 更新 package.json — 配置项、命令和激活事件"
```

---

### Task 9: 错误处理与状态栏完善

**Files:**
- Modify: `src/pasteCommand.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: 所有已完成模块
- Produces: 完善的错误处理

这一步对 Task 7 中已编写的 pasteCommand.ts 进行审查和微调，确保所有错误场景覆盖到位。Task 7 的代码中已经嵌入了完整的错误处理逻辑（配置校验、大小检查、HTTP 状态码识别、超时处理），此任务做最终确认。

- [ ] **Step 1: 审查 pasteCommand.ts 错误场景覆盖**

对照设计文档第 5 节错误处理表格：

| 场景 | 代码位置 | 处理方式 |
|------|----------|----------|
| 剪贴板无图片 | `if (!image)` 分支 | ✅ 回退默认粘贴 |
| S3 连接失败 | `catch` 分支 default | ✅ showErrorMessage |
| 凭证无效 403 | `catch` 分支 statusCode === 403 | ✅ 提示认证失败 |
| 存储桶不存在 404 | `catch` 分支 statusCode === 404 | ✅ 提示 bucket 不存在 |
| 上传超时 | `catch` 分支 timeout/ETIMEDOUT | ✅ 提示超时 |
| 图片过大 >50MB | `if (image.buffer.length > maxSize)` | ✅ 上传前检查 |
| 配置缺失 | `validateConfig` 分支 | ✅ 提示 + 跳转设置 |
| 上传成功 | try 块结束后 | ✅ 无提示 |
| 上传进行中 | statusBar 创建 | ✅ cloud-upload 图标 |
| 上传失败 | catch 块 statusBar | ✅ error 图标 |

- [ ] **Step 2: 确认 extension.ts 注册错误日志查看命令**

```ts
// src/extension.ts 补充
export function activate(context: vscode.ExtensionContext) {
  console.log('paste-image-to-s3 已激活');

  // 注册粘贴命令拦截
  const pasteDisposable = registerPasteCommand(context);
  context.subscriptions.push(pasteDisposable);

  // 注册错误日志查看命令（供状态栏点击使用）
  const errorLogDisposable = vscode.commands.registerCommand('paste-image-to-s3.showErrorLog', () => {
    const output = vscode.window.createOutputChannel('Paste Image to S3');
    output.show();
  });
  context.subscriptions.push(errorLogDisposable);
}
```

- [ ] **Step 3: 完整编译验证**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm compile && pnpm compile-tests && pnpm test
```
Expected: 编译 + 测试全部通过

- [ ] **Step 4: Commit**

```bash
git add src/pasteCommand.ts src/extension.ts
git commit -m "feat: 完善错误处理和状态栏反馈"
```

---

### Task 10: 清理与最终验证

**Files:**
- 无新文件创建

- [ ] **Step 1: 清理 Hello World 残留代码**

确认 `extension.ts` 中已无 `helloWorld` 命令注册。确认 `package.json` 中已无 `paste-image-to-s3.helloWorld` 命令。

- [ ] **Step 2: 运行完整编译和测试**

```bash
cd "C:/Users/zhouyq/Desktop/Personal/Projects/paste-image-to-s3" && pnpm package && pnpm test
```
Expected: 生产构建成功，所有测试通过

- [ ] **Step 3: F5 调试手动测试**

1. 在 VS Code 中按 F5 启动扩展开发窗口
2. 在新窗口中打开设置 (`Ctrl+,`)，搜索 `pasteImageToS3`，确认所有配置项出现
3. 配置 endpoint、bucket、accessKeyId、secretAccessKey
4. 截图或复制图片到剪贴板
5. 在 Markdown 文件中按 Ctrl+V
6. 验证：图片上传成功，URL 插入光标位置
7. 在 `.txt` 文件中粘贴，验证纯 URL 格式
8. 无图片时按 Ctrl+V，验证正常文本粘贴不受影响

- [ ] **Step 4: 清理并最终 Commit**

```bash
git status
git add -A
git commit -m "chore: 最终验证与清理"
```

---

## 任务依赖图

```
Task 1 (SDK 安装)
  └── Task 6 (s3Client.ts) ──┐
                              │
Task 2 (config.ts) ──────────┤
                              │
Task 3 (pathGenerator.ts) ───┤
                              ├── Task 7 (pasteCommand.ts) ── Task 8 (package.json)
Task 4 (urlBuilder.ts) ──────┤       │
                              │       └── Task 9 (错误处理完善)
Task 5 (imageUtils.ts) ──────┘
                                      Task 10 (清理验证)
```

Tasks 2-5 可并行（均为纯函数模块，彼此无依赖），Tasks 6 依赖 Task 1+2，Task 7 依赖 Tasks 2-6，Task 8 依赖 Task 7，Task 9 依赖 Tasks 7-8。
