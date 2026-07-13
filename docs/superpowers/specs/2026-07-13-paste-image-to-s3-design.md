# VSCode Paste Image to S3 — Design Spec

**Date**: 2026-07-13
**Status**: Approved
**Version**: V1

---

## 1. Overview

A VS Code extension that uploads clipboard images (screenshots) to an S3-compatible storage service and inserts the resulting URL into the editor at the cursor position. Supports both plain URL and Markdown `![](url)` formats.

### Goals

- Seamless screenshot-to-URL workflow: Ctrl+V triggers upload when clipboard contains an image
- Configurable S3 endpoint for self-hosted MinIO / S3-compatible services
- Flexible path generation with template placeholders
- URL prefix rewriting (internal endpoint → public URL)
- MD5 content-based deduplication

### Non-Goals (V1)

- Drag-and-drop image file upload (deferred to V2)
- Ctrl+Z undo to delete uploaded image (deferred to V2)

---

## 2. Configuration

All settings registered via `package.json` → `contributes.configuration`, editable in VS Code settings UI.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `pasteImageToS3.endpoint` | `string` | `""` | S3 endpoint URL, e.g. `http://192.168.1.100:9000` |
| `pasteImageToS3.bucket` | `string` | `""` | S3 bucket name |
| `pasteImageToS3.accessKeyId` | `string` | `""` | S3 Access Key ID |
| `pasteImageToS3.secretAccessKey` | `string` | `""` | S3 Secret Access Key |
| `pasteImageToS3.region` | `string` | `"us-east-1"` | S3 region (required by SDK; ignored by MinIO) |
| `pasteImageToS3.urlPrefix` | `string` | `""` | Public URL prefix to replace internal endpoint. e.g. endpoint = `http://192.168.1.100:9000`, urlPrefix = `https://cdn.example.com` → returned URL uses `https://cdn.example.com/{path}` |
| `pasteImageToS3.pathTemplate` | `string` | `"{year}/{month}/{md5}.{ext}"` | Upload path template with placeholders |
| `pasteImageToS3.urlFormat` | `enum` | `"auto"` | `"url"` — plain URL; `"markdown"` — `![](url)`; `"auto"` — markdown for `.md`/`.mdx` files, plain URL otherwise |
| `pasteImageToS3.forcePathStyle` | `boolean` | `true` | Use path-style addressing (required for MinIO) |
| `pasteImageToS3.useSsl` | `boolean` | `true` | Use HTTPS for S3 connection |

### Path Template Placeholders

| Placeholder | Example | Description |
|-------------|---------|-------------|
| `{bucket}` | `my-bucket` | Bucket name from config |
| `{year}` | `2026` | Current year (UTC) |
| `{month}` | `07` | Current month, 2-digit (UTC) |
| `{day}` | `13` | Current day, 2-digit (UTC) |
| `{md5}` | `a1b2c3d4...` | MD5 hash of image binary content (32 hex chars) |
| `{ext}` | `png` | File extension derived from image format |
| `{filename}` | `screenshot` | Original filename if available, otherwise `image` |

---

## 3. Architecture

### Module Structure

```
src/
├── extension.ts          # Entry point: activate/deactivate
├── config.ts             # Configuration reader & validation
├── s3Client.ts           # S3 client wrapper (@aws-sdk/client-s3)
├── pathGenerator.ts      # Path template → S3 key
├── urlBuilder.ts         # URL prefix rewriting + format
├── pasteCommand.ts       # Paste command override orchestration
└── imageUtils.ts         # Clipboard reading, MD5, extension detection
```

### Data Flow

```
User presses Ctrl+V
        │
        ▼
  pasteCommand intercepts editor.action.clipboardPasteAction
        │
        ▼
  imageUtils.readClipboardImage()
        │
        ├── no image → executeCommand('default:editor.action.clipboardPasteAction') (fallback)
        │
        └── has image → binary buffer
                │
                ▼
        imageUtils.computeMd5(buffer)
                │
                ▼
        pathGenerator.generate(template, context)
                │
                ▼
        s3Client.upload(bucket, key, buffer, contentType)
                │
                ▼
        urlBuilder.build(s3Key, urlPrefix, format, fileType)
                │
                ▼
        editor.edit(insert url at cursor)
```

### Module Responsibilities

- **config.ts** — Pure functions reading VS Code workspace configuration with defaults and validation. No dependencies on other project modules.
- **imageUtils.ts** — Pure utility functions: read image from VS Code clipboard API, compute MD5 hash, detect file extension from buffer magic bytes. No VS Code API dependency beyond clipboard.
- **pathGenerator.ts** — Pure function: string template replacement with `{placeholders}`. No side effects.
- **urlBuilder.ts** — Pure function: construct final URL from S3 key, apply prefix rewriting, format as plain or markdown. No side effects.
- **s3Client.ts** — Singleton wrapper around `@aws-sdk/client-s3`. Creates S3 client from config, exposes `upload()` method. Single responsibility: S3 communication.
- **pasteCommand.ts** — Orchestration layer. Registers the command override, coordinates the pipeline. Depends on all other modules.

---

## 4. Paste Interception

Override `editor.action.clipboardPasteAction` via `vscode.commands.registerTextEditorCommand`.

```ts
vscode.commands.registerTextEditorCommand(
  'editor.action.clipboardPasteAction',
  async (editor) => {
    const image = await readClipboardImage();
    if (!image) {
      // No image — delegate to default paste
      return vscode.commands.executeCommand(
        'default:editor.action.clipboardPasteAction'
      );
    }

    try {
      const url = await uploadAndBuildUrl(image);
      await editor.edit(eb => eb.insert(editor.selection.active, url));
    } catch (err) {
      // Error handled per table below; editor content unchanged
    }
  }
);
```

---

## 5. Error Handling

| Scenario | Behavior |
|----------|----------|
| Clipboard has no image | Silent fallback to default paste |
| S3 connection failure | `showErrorMessage` with reason; editor unchanged |
| Invalid credentials (403) | "S3 authentication failed. Please check your Access Key configuration." |
| Bucket not found (404) | "Bucket not found. Please check the bucket name in settings." |
| Upload timeout | "Upload timed out. Please check your network connection." |
| Image too large (>50MB) | "Image too large (X MB). Maximum is 50 MB." — checked before upload |
| Configuration missing (endpoint/bucket/key) | Warning on first use with button to open settings |
| Unsupported file format (drag) | Silent ignore for non-image files |
| Upload success | No notification — URL appears at cursor silently |
| Upload in progress | Status bar: `$(cloud-upload) Uploading...` |
| Upload failure | Status bar: `$(error) Upload failed` (clickable for details) |

---

## 6. Dependencies

### Runtime

- `@aws-sdk/client-s3` — S3 SDK for PutObject

### Dev

- Existing devDependencies in `package.json` are sufficient:
  - `typescript`, `esbuild`, `eslint`, `@types/vscode`, `@types/node`, `@vscode/test-cli`, `@vscode/test-electron`, `mocha`

---

## 7. Testing Strategy

| Layer | Approach | Scope |
|-------|----------|-------|
| `pathGenerator.ts` | Unit test | All placeholders, edge cases (empty template, unknown placeholder) |
| `urlBuilder.ts` | Unit test | urlPrefix with/without trailing slash, plain vs markdown formatting |
| `imageUtils.ts` | Unit test | MD5 known vectors, extension detection from magic bytes |
| `config.ts` | Unit test | Default values, missing config, invalid enum values |
| `s3Client.ts` | Integration test | Mock S3 SDK; verify correct client construction and upload parameters |
| `pasteCommand.ts` | E2E test | Extension Test Runner: launch VS Code, simulate paste with image |

---

## 8. V2 Roadmap (Out of Scope)

- **Drag-and-drop support** — `DocumentDropEditProvider` for dragging image files from file manager into the editor
- **Undo support** — Ctrl+Z to delete the uploaded S3 object and remove the inserted URL
