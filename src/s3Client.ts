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
