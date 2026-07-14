# 更新日志

## [0.0.3] - 2026-07-14

### 修复

- 修复覆盖 `editor.action.clipboardPasteAction` 导致查找框（Ctrl+F）、全局搜索框、SCM 输入等粘贴文字错进代码文件的问题
- 改为独立命令 `pasteImageToS3.paste` + Ctrl+V 快捷键（仅 `editorTextFocus` 触发），输入型控件恢复原生粘贴
- 普通文字粘贴重新派发内置粘贴命令，保留自动缩进/格式化等智能粘贴能力
- 配置校验仅在有图片时执行，未配置 S3 时粘贴普通文字不受影响

## [0.0.2] - 2026-07-14

### 优化

- 回写 URL 为 Markdown 格式时，填充图片名称

## [0.0.1] - 2026-07-14

### 新增

- 首次发布
- 粘贴图片自动上传 S3，回写 URL 到编辑器
- 支持截图软件截屏、浏览器复制图片、文件管理器复制图片文件三种来源
- 10 项配置项：endpoint / bucket / accessKeyId / secretAccessKey / region / urlPrefix / pathTemplate / urlFormat / forcePathStyle / useSsl
- 路径模板支持占位符：{bucket} {year} {month} {day} {md5} {ext} {filename}
- URL 格式三种模式：纯链接 / Markdown / 自动检测
- MD5 内容哈希去重命名
- 光标处沙漏占位符，上传完成替换
- 调试日志输出（按 F5 在 Debug Console 查看各环节耗时）
