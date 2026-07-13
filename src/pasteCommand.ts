// src/pasteCommand.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { getConfig, validateConfig } from './config';
import { S3Uploader } from './s3Client';
import { generatePath } from './pathGenerator';
import { buildUrl, type UrlFormat } from './urlBuilder';
import { readClipboardImage, computeMd5, extensionFromFormat } from './imageUtils';

/** 共享错误日志输出通道 */
let errorChannel: vscode.OutputChannel | undefined;

function getErrorChannel(): vscode.OutputChannel {
  if (!errorChannel) {
    errorChannel = vscode.window.createOutputChannel('Paste Image to S3');
  }
  return errorChannel;
}

function logError(detail: string): void {
  const channel = getErrorChannel();
  channel.appendLine(`[${new Date().toISOString()}] ${detail}`);
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
    getErrorChannel().show();
  });

  const pasteCmd = vscode.commands.registerTextEditorCommand(
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
            getErrorChannel().show();
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

  return vscode.Disposable.from(pasteCmd, errorLogCmd);
}
