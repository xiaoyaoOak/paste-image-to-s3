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
