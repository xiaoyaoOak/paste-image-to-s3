// src/test/imageUtils.test.ts
import * as assert from 'assert';
import { computeMd5, extensionFromFormat } from '../imageUtils';

suite('imageUtils 模块', () => {

  test('computeMd5 计算已知向量的 MD5', () => {
    const buffer = Buffer.from('hello world');
    const md5 = computeMd5(buffer);
    assert.strictEqual(md5, '5eb63bbbe01eeed093cb22bb8f5acdc3');
  });

  test('computeMd5 空 Buffer', () => {
    const buffer = Buffer.alloc(0);
    const md5 = computeMd5(buffer);
    assert.strictEqual(md5, 'd41d8cd98f00b204e9800998ecf8427e');
  });

  test('computeMd5 二进制 Buffer', () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0xFF]);
    const md5 = computeMd5(buffer);
    assert.strictEqual(md5.length, 32);
    assert.strictEqual(typeof md5, 'string');
  });

  test('extensionFromFormat png → png', () => {
    assert.strictEqual(extensionFromFormat('png'), 'png');
  });

  test('extensionFromFormat jpeg → jpg', () => {
    assert.strictEqual(extensionFromFormat('jpeg'), 'jpg');
  });

  test('extensionFromFormat gif → gif', () => {
    assert.strictEqual(extensionFromFormat('gif'), 'gif');
  });

  test('extensionFromFormat webp → webp', () => {
    assert.strictEqual(extensionFromFormat('webp'), 'webp');
  });

  test('extensionFromFormat 未知格式返回原值', () => {
    assert.strictEqual(extensionFromFormat('unknown'), 'unknown');
  });

});
