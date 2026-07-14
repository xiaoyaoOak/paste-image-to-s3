// src/pasteCommand.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getConfig, validateConfig } from './config';
import { S3Uploader } from './s3Client';
import { generatePath } from './pathGenerator';
import { buildUrl, type UrlFormat } from './urlBuilder';
import { readClipboardImage, readClipboardFilePaths, computeMd5, extensionFromFormat } from './imageUtils';

/** 共享输出通道 */
let sharedChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!sharedChannel) {
    sharedChannel = vscode.window.createOutputChannel('Paste Image to S3');
  }
  return sharedChannel;
}

function logError(detail: string): void {
  getChannel().appendLine(`[ERROR] ${detail}`);
}

// ─── 调试日志 ───────────────────────────────────────────
const DEBUG_ENABLED = true; // 发布时可改为 false

function debugLog(msg: string): void {
  if (!DEBUG_ENABLED) { return; }
  const ts = new Date().toISOString();
  console.log(`[paste-image-to-s3] ${ts} ${msg}`);
  getChannel().appendLine(`[DEBUG] ${ts} ${msg}`);
}

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

/** 支持上传的图片扩展名 */
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.svg']);

/** 检测剪贴板文字是否为图片文件路径，若是则读取文件内容 */
function tryReadImageFile(text: string): { buffer: Buffer; format: string } | null {
  // 去引号、去首尾空白
  const trimmed = text.replace(/^["']|["']$/g, '').trim();
  // 只处理单行路径
  if (trimmed.includes('\n') || trimmed.includes('\r')) { return null; }

  const ext = path.extname(trimmed).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) { return null; }
  if (!fs.existsSync(trimmed)) { return null; }

  const buffer = fs.readFileSync(trimmed);
  // 去掉 .svg 后缀：png/jpg/gif/webp/bmp/tiff → remove dot
  const format = ext.slice(1); // "png"
  return { buffer, format };
}

/** 注册粘贴命令拦截 */
export function registerPasteCommand(context: vscode.ExtensionContext): vscode.Disposable {

  // 注册错误日志查看命令
  const errorLogCmd = vscode.commands.registerCommand('paste-image-to-s3.showErrorLog', () => {
    getChannel().show();
  });

  const pasteCmd = vscode.commands.registerTextEditorCommand(
    'editor.action.clipboardPasteAction',
    async (editor) => {
      const tStart = Date.now();
      debugLog('━━━━━ 粘贴触发 ━━━━━');

      const config = getConfig();

      // 步骤 1: 先校验配置（剪贴板读取前，避免白跑 PowerShell）
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

      // 步骤 2: 读取图片 — 三种来源依次尝试
      let image: { buffer: Buffer; format: string } | undefined;

      // 2a: 截图 / 复制图片二进制（截图软件、浏览器右键复制图片等）
      const tImg = Date.now();
      const clipImage = await readClipboardImage();
      debugLog(`读取剪贴板图片(二进制): ${Date.now() - tImg}ms, ${clipImage ? `${clipImage.format} ${(clipImage.buffer.length / 1024).toFixed(1)}KB` : '无图片'}`);

      if (clipImage) {
        image = clipImage;
      } else {
        // 2b: 剪贴板文字 → 可能是文件路径或纯文本
        const tText = Date.now();
        const clipText = await vscode.env.clipboard.readText();
        debugLog(`读取剪贴板文字: ${Date.now() - tText}ms, ${clipText ? `${clipText.length} 字符` : '无文字'}`);

        if (clipText) {
          const fileImage = tryReadImageFile(clipText);
          if (fileImage) {
            // 单文件路径复制的图片 → 读取文件内容上传
            image = fileImage;
            debugLog(`从文件路径读取图片: ${(fileImage.buffer.length / 1024).toFixed(1)}KB`);
          } else {
            // 普通文字 → 直接粘贴
            await editor.edit(editBuilder => {
              editBuilder.insert(editor.selection.active, clipText);
            });
            debugLog(`文字粘贴完成: ${clipText.length} 字符, 总${Date.now() - tStart}ms`);
            return;
          }
        } else {
          // 2c: 无文字也无二进制 → Windows 文件管理器多选复制 (CF_HDROP)
          const tDrop = Date.now();
          const filePaths = readClipboardFilePaths();
          debugLog(`读取剪贴板文件列表: ${Date.now() - tDrop}ms, ${filePaths.length} 个文件`);

          const firstImage = filePaths.find(p => {
            const ext = path.extname(p).toLowerCase();
            return IMAGE_EXTS.has(ext);
          });
          if (firstImage && fs.existsSync(firstImage)) {
            const buf = fs.readFileSync(firstImage);
            const fmt = path.extname(firstImage).toLowerCase().slice(1);
            image = { buffer: buf, format: fmt };
            debugLog(`从文件列表读取图片: ${firstImage}, ${(buf.length / 1024).toFixed(1)}KB`);
          }
        }
      }

      if (!image) {
        debugLog(`剪贴板为空, 总${Date.now() - tStart}ms`);
        return;
      }

      // 检查图片大小 (50MB 限制)
      const maxSize = 50 * 1024 * 1024;
      if (image.buffer.length > maxSize) {
        const sizeMB = (image.buffer.length / (1024 * 1024)).toFixed(1);
        vscode.window.showErrorMessage(`图片过大 (${sizeMB} MB)，最大支持 50 MB`);
        return;
      }

      // ─── 光标处插入加载占位符 ───
      const cursorPos = editor.selection.active;
      const placeholderLabel = '⌛';
      const placeholderLen = 1; // 单字符，后续 Range 计算更精确

      const inserted = await editor.edit(editBuilder => {
        editBuilder.insert(cursorPos, placeholderLabel);
      }, { undoStopBefore: false, undoStopAfter: false });

      if (!inserted) {
        debugLog('占位符插入失败，终止');
        return;
      }
      const placeholderEnd = cursorPos.translate(0, placeholderLen);
      debugLog(`光标占位符已插入: "${placeholderLabel}"`);

      try {
        // 步骤 2: 计算 MD5
        const tMd5 = Date.now();
        const md5 = computeMd5(image.buffer);
        const ext = extensionFromFormat(image.format);
        const now = new Date();
        debugLog(`MD5 计算: ${Date.now() - tMd5}ms, md5=${md5}, ext=${ext}`);

        // 步骤 3: 生成路径
        const tPath = Date.now();
        const s3Key = generatePath(config.pathTemplate, {
          bucket: config.bucket,
          year: String(now.getUTCFullYear()),
          month: String(now.getUTCMonth() + 1).padStart(2, '0'),
          day: String(now.getUTCDate()).padStart(2, '0'),
          md5,
          ext,
          filename: 'image',
        });
        debugLog(`路径生成: ${Date.now() - tPath}ms, key=${s3Key}`);

        // 步骤 4: S3 上传
        const tUpload = Date.now();
        debugLog(`开始上传 S3...`);
        const uploader = new S3Uploader(config);
        const contentType = getContentType(image.format);
        await uploader.upload(s3Key, image.buffer, contentType);
        const uploadDuration = Date.now() - tUpload;
        debugLog(`S3 上传完成: ${uploadDuration}ms (${(image.buffer.length / 1024 / uploadDuration * 1000).toFixed(0)}KB/s)`);

        // 步骤 5: 构建 URL
        const tUrl = Date.now();
        const format = resolveUrlFormat(config.urlFormat, editor);
        const url = buildUrl(s3Key, config.urlPrefix, format);
        debugLog(`URL 构建: ${Date.now() - tUrl}ms, url=${url}`);

        // 步骤 6: 替换占位符为最终 URL
        await editor.edit(editBuilder => {
          editBuilder.replace(new vscode.Range(cursorPos, placeholderEnd), url);
        }, { undoStopBefore: true, undoStopAfter: true });

        const totalDuration = Date.now() - tStart;
        debugLog(`━━━━━ 完成: ${totalDuration}ms ━━━━━`);
      } catch (err: any) {
        // 删除占位符
        await editor.edit(editBuilder => {
          editBuilder.replace(new vscode.Range(cursorPos, placeholderEnd), '');
        }, { undoStopBefore: false, undoStopAfter: false });

        const message = err?.message || String(err);
        const statusCode = err?.$metadata?.httpStatusCode;
        debugLog(`上传失败: ${message}`);

        logError(message);

        if (statusCode === 403 || message.includes('AccessDenied') || message.includes('Forbidden')) {
          vscode.window.showErrorMessage('S3 认证失败，请检查 Access Key 配置');
        } else if (statusCode === 404 || message.includes('NotFound') || message.includes('NoSuchBucket')) {
          vscode.window.showErrorMessage('存储桶不存在，请检查配置中的 bucket 名称');
        } else if (message.includes('timeout') || message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
          vscode.window.showErrorMessage('上传超时，请检查网络连接');
        } else {
          const action = await vscode.window.showErrorMessage(`S3 上传失败: ${message}`, '查看详情');
          if (action === '查看详情') {
            getChannel().show();
          }
        }

        debugLog(`━━━━━ 失败: ${Date.now() - tStart}ms ━━━━━`);
      }
    }
  );

  return vscode.Disposable.from(pasteCmd, errorLogCmd);
}
