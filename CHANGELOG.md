# 更新日志

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

## [0.0.2] - 2026-07-14

### 优化

- 回写 URL 为 Markdown 格式时，填充图片名称