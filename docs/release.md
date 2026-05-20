# 发布指南

本仓库发布的是公开本地基础工具版，不发布平台版、平台部署文件、平台后台或托管 Key 相关代码。

## 发布产物

Release 应包含两类普通用户可用的附件：

- `gpt-image-2-studio-lite.html`：单文件 HTML，下载后双击打开。
- Windows `setup.exe`：桌面安装包，适合长期使用。

`SHA256SUMS.txt` 会记录 Release 附件的 SHA-256 校验值。

## 本地发布前检查

```powershell
npm run release:check
npm run test:run
npm run build
npm run build:static
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

如果当前机器没有 Rust toolchain，可以先完成前端和静态 HTML 检查，再在有 Rust 环境的机器或 GitHub Actions 中完成桌面端检查。

## 单文件 HTML

构建：

```powershell
npm run build:static
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

## GitHub Actions 发布流程

1. 确认 `main` 是干净的公开基础工具版。
2. 创建版本 tag，例如：

```powershell
git tag v0.1.2
git push origin main
git push origin v0.1.2
```

3. 等待 `.github/workflows/release.yml` 完成。
4. 打开 GitHub Releases，检查草稿 Release。
5. 下载 `gpt-image-2-studio-lite.html` 和 `setup.exe` 做一次手动验收。
6. 验收通过后，手动发布草稿 Release。

也可以在 GitHub Actions 页面手动触发 Release workflow，并填写 `tag_name`。

## 校验下载文件

Windows PowerShell：

```powershell
Get-FileHash .\gpt-image-2-studio-lite.html -Algorithm SHA256
Get-FileHash .\GPT-Image-2-Studio_0.1.2_x64-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## 暂缓事项

- `.msi`：首版先不作为主链路，避免维护两套安装包验收。
- 代码签名：后续用于降低 Windows SmartScreen 拦截概率。
- 自动更新：需要先明确签名、发布通道和回滚策略。
