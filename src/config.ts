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
