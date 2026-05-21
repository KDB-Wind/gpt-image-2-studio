# Release 人工验收清单

本文档用于公开 Release 前的人工验收。自动检查不能替代安装包和静态页实测。

## 发布前本地检查

在 `main` 分支运行：

```powershell
npm run release:check
npm run test:run
npm run build
npm run build:static
npm run site:check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

全部通过后再创建 tag。

## GitHub Pages 验收

1. 确认仓库 Settings -> Pages 的 Source 是 `GitHub Actions`。
2. 推送 `main`。
3. 等待 `Pages` workflow 完成。
4. 打开 `https://kdb-wind.github.io/gpt-image-2-studio/`。
5. 搜索页面源码，确认没有 `sk-`。
6. 填写测试用 `API key` 和 `Base URL`。
7. 测试文字模型。
8. 测试图片模型。
9. 生成一张图片。
10. 用无痕窗口打开页面，确认不会自动带出普通窗口保存的 key。

## GitHub Release 验收

1. 推送版本 tag，或手动触发 `Release` workflow。
2. 等待 `Release` workflow 完成。
3. 确认生成草稿 Release。
4. 确认附件包含 `gpt-image-2-studio-lite.html`、Windows `setup.exe` 和 `SHA256SUMS.txt`。
5. 下载附件。
6. 用 `Get-FileHash` 对比 `SHA256SUMS.txt`。
7. 双击打开 HTML，完成一次设置、测试和生图。
8. 安装 Windows `setup.exe`，完成一次设置、测试和生图。

## CORS 验收

```powershell
$env:BASE_URL = "https://ruoli.dev/v1"
$env:SITE_ORIGIN = "https://kdb-wind.github.io"
npm run cors:check
```

通过时应返回 `CORS preflight check passed.`。

## 失败处理

- 静态页无法调用接口：优先检查 CORS。
- 生图失败但文字模型成功：优先检查图片模型名、供应商上游状态和账号权限。
- Release 附件缺失：检查 `.github/workflows/release.yml`。
- Pages 未发布：检查 `.github/workflows/pages.yml` 和仓库 Pages 设置。
