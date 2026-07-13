// src/test/urlBuilder.test.ts
import * as assert from 'assert';
import { buildUrl } from '../urlBuilder';

suite('urlBuilder 模块', () => {

  test('纯 URL 模式 — 有 urlPrefix', () => {
    const result = buildUrl('2026/07/abc.png', 'https://cdn.example.com', 'url');
    assert.strictEqual(result, 'https://cdn.example.com/2026/07/abc.png');
  });

  test('纯 URL 模式 — 无 urlPrefix 返回原始 key', () => {
    const result = buildUrl('2026/07/abc.png', '', 'url');
    assert.strictEqual(result, '2026/07/abc.png');
  });

  test('Markdown 模式 — 有 urlPrefix', () => {
    const result = buildUrl('2026/07/abc.png', 'https://cdn.example.com', 'markdown');
    assert.strictEqual(result, '![](https://cdn.example.com/2026/07/abc.png)');
  });

  test('Markdown 模式 — 无 urlPrefix', () => {
    const result = buildUrl('2026/07/abc.png', '', 'markdown');
    assert.strictEqual(result, '![](2026/07/abc.png)');
  });

  test('urlPrefix 尾部斜杠应被规范化', () => {
    const result = buildUrl('img/photo.png', 'https://cdn.example.com/', 'url');
    assert.strictEqual(result, 'https://cdn.example.com/img/photo.png');
  });

  test('urlPrefix 多个尾部斜杠全部移除', () => {
    const result = buildUrl('img/photo.png', 'https://cdn.example.com///', 'url');
    assert.strictEqual(result, 'https://cdn.example.com/img/photo.png');
  });

});
