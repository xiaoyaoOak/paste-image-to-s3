// src/urlBuilder.ts

export type UrlFormat = 'url' | 'markdown';

/**
 * 根据 S3 Key 和配置构建最终返回 URL
 * @param s3Key 上传路径，如 "2026/07/a1b2.png"
 * @param urlPrefix 为空时直接拼接 endpoint 风格路径；非空时替换
 * @param format "url" 返回纯 URL，"markdown" 返回 ![](url)
 */
export function buildUrl(s3Key: string, urlPrefix: string, format: UrlFormat, md5: string): string {
  // 规范化前缀：去尾部斜杠
  const prefix = urlPrefix.replace(/\/+$/, '');
  const url = prefix ? `${prefix}/${s3Key}` : s3Key;

  if (format === 'markdown') {
    return `![image-${md5}](${url})`;
  }
  return url;
}
