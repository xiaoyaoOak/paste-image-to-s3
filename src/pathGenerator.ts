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
