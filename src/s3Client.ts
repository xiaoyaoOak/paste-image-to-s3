// src/s3Client.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { PasteImageConfig } from './config';

export class S3Uploader {
  private client: S3Client;
  private bucket: string;

  constructor(config: PasteImageConfig) {
    this.bucket = config.bucket;

    // 根据 useSsl 配置修正 endpoint 协议前缀
    let endpoint = config.endpoint;
    if (!config.useSsl) {
      // 强制使用 HTTP
      endpoint = endpoint.replace(/^https:\/\//, 'http://');
      if (!/^https?:\/\//.test(endpoint)) {
        endpoint = `http://${endpoint}`;
      }
    } else {
      // 强制使用 HTTPS
      endpoint = endpoint.replace(/^http:\/\//, 'https://');
      if (!/^https?:\/\//.test(endpoint)) {
        endpoint = `https://${endpoint}`;
      }
    }

    this.client = new S3Client({
      endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
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
