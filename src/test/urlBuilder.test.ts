// src/test/urlBuilder.test.ts
import * as assert from 'assert';
import { buildUrl } from '../urlBuilder';

suite('urlBuilder 模块', () => {

  const MD5 = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

  test('纯 URL 模式 — 有 urlPrefix', () => {
    const result = buildUrl('2026/07/abc.png', 'https://cdn.example.com', 'url', MD5);
    assert.strictEqual(result, 'https://cdn.example.com/2026/07/abc.png');
  });

  test('纯 URL 模式 — 无 urlPrefix 返回原始 key', () => {
    const result = buildUrl('2026/07/abc.png', '', 'url', MD5);
    assert.strictEqual(result, '2026/07/abc.png');
  });

  test('Markdown 模式 — 有 urlPrefix，填充图片名', () => {
    const result = buildUrl('2026/07/abc.png', 'https://cdn.example.com', 'markdown', MD5);
    assert.strictEqual(result, `![image-${MD5}](https://cdn.example.com/2026/07/abc.png)`);
  });

  test('Markdown 模式 — 无 urlPrefix', () => {
    const result = buildUrl('2026/07/abc.png', '', 'markdown', MD5);
    assert.strictEqual(result, `![image-${MD5}](2026/07/abc.png)`);
  });

  test('urlPrefix 尾部斜杠应被规范化', () => {
    const result = buildUrl('img/photo.png', 'https://cdn.example.com/', 'url', MD5);
    assert.strictEqual(result, 'https://cdn.example.com/img/photo.png');
  });

  test('urlPrefix 多个尾部斜杠全部移除', () => {
    const result = buildUrl('img/photo.png', 'https://cdn.example.com///', 'url', MD5);
    assert.strictEqual(result, 'https://cdn.example.com/img/photo.png');
  });

});
