// src/extension.ts
import * as vscode from 'vscode';
import { registerPasteCommand } from './pasteCommand';

export function activate(context: vscode.ExtensionContext) {
  console.log('paste-image-to-s3 已激活');

  // 注册粘贴命令拦截
  const pasteDisposable = registerPasteCommand(context);
  context.subscriptions.push(pasteDisposable);

  // 注册错误日志查看命令
  const errorLogDisposable = vscode.commands.registerCommand('paste-image-to-s3.showErrorLog', () => {
    const output = vscode.window.createOutputChannel('Paste Image to S3');
    output.show();
  });
  context.subscriptions.push(errorLogDisposable);
}

export function deactivate() {}
