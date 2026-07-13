// src/test/s3Client.test.ts
import * as assert from 'assert';
import { S3Uploader } from '../s3Client';
import type { PasteImageConfig } from '../config';

suite('s3Client 模块', () => {

  const validConfig: PasteImageConfig = {
    endpoint: 'http://localhost:9000',
    bucket: 'my-bucket',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    region: 'us-east-1',
    urlPrefix: '',
    pathTemplate: '{year}/{month}/{md5}.{ext}',
    urlFormat: 'auto',
    forcePathStyle: true,
    useSsl: false,
  };

  test('S3Uploader 构造时应接受合法配置', () => {
    const uploader = new S3Uploader(validConfig);
    assert.ok(uploader instanceof S3Uploader);
  });

  test('S3Uploader 构造时使用 forcePathStyle=true', () => {
    const uploader = new S3Uploader(validConfig);
    assert.ok(uploader instanceof S3Uploader);
  });

  test('S3Uploader 构造时 useSsl=false', () => {
    const cfg = { ...validConfig, useSsl: false };
    const uploader = new S3Uploader(cfg);
    assert.ok(uploader instanceof S3Uploader);
  });

  test('S3Uploader 构造时使用自定义 region', () => {
    const cfg = { ...validConfig, region: 'cn-north-1' };
    const uploader = new S3Uploader(cfg);
    assert.ok(uploader instanceof S3Uploader);
  });

});
