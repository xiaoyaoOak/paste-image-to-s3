// src/pasteCommand.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { getConfig, validateConfig } from './config';
import { S3Uploader } from './s3Client';
import { generatePath } from './pathGenerator';
import { buildUrl, type UrlFormat } from './urlBuilder';
import { readClipboardImage, computeMd5, extensionFromFormat } from './imageUtils';

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

      // 步骤 2: 读取剪贴板图片
      const tClip = Date.now();
      const image = await readClipboardImage();
      debugLog(`读取剪贴板: ${Date.now() - tClip}ms, ${image ? `${image.format} ${(image.buffer.length / 1024).toFixed(1)}KB` : '无图片'}`);

      if (!image) {
        // 无图片 — 回退到默认粘贴
        return vscode.commands.executeCommand('default:editor.action.clipboardPasteAction');
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
