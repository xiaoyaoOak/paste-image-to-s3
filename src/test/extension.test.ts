import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	test('扩展应正常激活', () => {
		const ext = vscode.extensions.all.find(e => e.id.includes('paste-image-to-s3'));
		assert.ok(ext, '扩展未找到');
		assert.strictEqual(ext?.isActive, true);
	});
});
