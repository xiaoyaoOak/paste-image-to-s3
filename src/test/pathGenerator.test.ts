// src/test/pathGenerator.test.ts
import * as assert from 'assert';
import { generatePath, PathContext } from '../pathGenerator';

suite('pathGenerator 模块', () => {

  const context: PathContext = {
    bucket: 'my-bucket',
    year: '2026',
    month: '07',
    day: '13',
    md5: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    ext: 'png',
    filename: 'screenshot',
  };

  test('默认模板 {year}/{month}/{md5}.{ext}', () => {
    const result = generatePath('{year}/{month}/{md5}.{ext}', context);
    assert.strictEqual(result, '2026/07/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.png');
  });

  test('包含 bucket 的模板', () => {
    const result = generatePath('{bucket}/{year}/{month}/{md5}.{ext}', context);
    assert.strictEqual(result, 'my-bucket/2026/07/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.png');
  });

  test('包含 filename 的模板', () => {
    const result = generatePath('{bucket}/{filename}.{ext}', context);
    assert.strictEqual(result, 'my-bucket/screenshot.png');
  });

  test('包含 day 的模板', () => {
    const result = generatePath('{year}/{month}/{day}/{md5}.{ext}', context);
    assert.strictEqual(result, '2026/07/13/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.png');
  });

  test('无占位符的模板原样返回', () => {
    const result = generatePath('images/photo.jpg', context);
    assert.strictEqual(result, 'images/photo.jpg');
  });

  test('空模板返回空字符串', () => {
    const result = generatePath('', context);
    assert.strictEqual(result, '');
  });

  test('未知占位符保留原样', () => {
    const result = generatePath('{unknown}/{year}.{ext}', context);
    assert.strictEqual(result, '{unknown}/2026.png');
  });

});
