// src/extension.ts
import * as vscode from 'vscode';
import { registerPasteCommand } from './pasteCommand';

export function activate(context: vscode.ExtensionContext) {
  console.log('paste-image-to-s3 已激活');

  // 注册粘贴命令拦截（含 showErrorLog 命令）
  context.subscriptions.push(registerPasteCommand(context));
}

export function deactivate() {}
