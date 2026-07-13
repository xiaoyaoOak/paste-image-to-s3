import * as assert from 'assert';
import * as vscode from 'vscode';
import { getConfig, validateConfig } from '../config';

suite('config 模块', () => {

  test('getConfig 应返回默认值', () => {
    const config = getConfig();
    assert.strictEqual(config.region, 'us-east-1');
    assert.strictEqual(config.pathTemplate, '{year}/{month}/{md5}.{ext}');
    assert.strictEqual(config.urlFormat, 'auto');
    assert.strictEqual(config.forcePathStyle, true);
    assert.strictEqual(config.useSsl, true);
    assert.strictEqual(config.endpoint, '');
    assert.strictEqual(config.bucket, '');
  });

  test('validateConfig 缺失全部必填项时应返回 valid=false', () => {
    const config = getConfig();
    const result = validateConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.missing.includes('endpoint'));
    assert.ok(result.missing.includes('bucket'));
    assert.ok(result.missing.includes('accessKeyId'));
    assert.ok(result.missing.includes('secretAccessKey'));
  });

  test('validateConfig 全部必填项存在时应返回 valid=true', () => {
    const config = getConfig();
    config.endpoint = 'http://localhost:9000';
    config.bucket = 'images';
    config.accessKeyId = 'minioadmin';
    config.secretAccessKey = 'minioadmin';
    const result = validateConfig(config);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.missing.length, 0);
  });

  test('validateConfig 部分缺失时应正确返回缺失字段', () => {
    const config = getConfig();
    config.endpoint = 'http://localhost:9000';
    const result = validateConfig(config);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.missing.length, 3);
    assert.ok(!result.missing.includes('endpoint'));
  });

});
