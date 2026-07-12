# 发布指南

本仓库发布的是公开本地基础工具版，不发布平台版、平台部署文件、平台后台或托管 Key 相关代码。

## Archive Anchor

The archive trust root is external to the repository. Before local strict or historical checks, set `$env:STATIC_ARCHIVE_TRUSTED_BASE = "<FULL_TRUSTED_COMMIT_SHA>"`. The current intended public value is `1c35245852f95a7aa0baad14d8b1817d968c685c`. Missing, malformed, unresolved, or non-ancestor values fail closed; repository files, `HEAD^`, and workflow inputs are not fallbacks.

Before CI, Pages, or Release can run, create the GitHub Repository Variable `STATIC_ARCHIVE_TRUSTED_BASE` under **Settings > Secrets and variables > Actions > Variables**. Push event or merge bases are additional comparisons only and cannot replace this external trust root.

## 发布产物

Release 应包含两类普通用户可用的附件：

- `gpt-image-2-studio-lite.html`：单文件 HTML，下载后双击打开。
- Windows `setup.exe`：桌面安装包，适合长期使用。

`SHA256SUMS.txt` 会记录 Release 附件的 SHA-256 校验值。

## 静态站发布

GitHub Pages 发布由 `.github/workflows/pages.yml` 负责。

发布前确认：

```powershell
$env:STATIC_ARCHIVE_TRUSTED_BASE = "<FULL_TRUSTED_COMMIT_SHA>"
npm run release:check
npm run test:run
npm run site:verify
```

仓库 Settings -> Pages 中，Source 应选择 `GitHub Actions`。推送 `main` 后会发布：

```text
https://kdb-wind.github.io/gpt-image-2-studio/
```

静态站只适用于 BYOK 模式，用户填写自己的 `API key` 和 `Base URL`。如果供应商 CORS 不通过，浏览器会拦截请求。

## 本地发布前检查

```powershell
$env:STATIC_ARCHIVE_TRUSTED_BASE = "<FULL_TRUSTED_COMMIT_SHA>"
npm run release:check
npm run test:run
npm run build
npm run build:static
npm run site:check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

如果当前机器没有 Rust toolchain，可以先完成前端和静态 HTML 检查，再在有 Rust 环境的机器或 GitHub Actions 中完成桌面端检查。

## 单文件 HTML

构建：

```powershell
npm run build:static
npm run site:check
```

发布附件：

```text
dist-static/gpt-image-2-studio-lite.html
```

不要把仓库根目录 `index.html` 当成 Release 附件。它只是 Vite 源码入口，不能独立运行。

## Windows 安装包

打包：

```powershell
npm run desktop:build
```

Tauri Windows 配置要求：

- `bundle.targets` 包含 `nsis`
- `bundle.windows.webviewInstallMode.type` 为 `offlineInstaller`

这会产出面向普通用户的 `setup.exe`。

## GitHub Actions Release 流程

1. 确认 `main` 是干净的公开基础工具版。
2. 创建版本 tag，例如：

```powershell
git tag v0.1.7
git push origin main
git push origin v0.1.7
```

3. 等待 `.github/workflows/release.yml` 完成。
4. 打开 GitHub Releases，检查草稿 Release。
5. 下载 `gpt-image-2-studio-lite.html` 和 `setup.exe` 做一次手动验收。
6. 验收通过后，手动发布草稿 Release。

也可以通过 `workflow_dispatch` 在 GitHub Actions 页面手动触发 Release workflow，并填写 `tag_name`。该入口只用于重跑或受控调度；匹配的 tag 必须在远程仓库中已存在，它不会创建缺失的标签。

## 校验下载文件

Windows PowerShell：

```powershell
Get-FileHash .\gpt-image-2-studio-lite.html -Algorithm SHA256
Get-FileHash .\GPT-Image-2-Studio_0.1.7_x64-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## 暂缓事项

- `.msi`：首版先不作为主链路，避免维护两套安装包验收。
- 代码签名：后续用于降低 Windows SmartScreen 拦截概率。
- 自动更新：需要先明确签名、发布通道和回滚策略。
