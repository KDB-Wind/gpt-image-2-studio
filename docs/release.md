# 发布 Windows 安装包

本仓库的公开发布目标是面向普通用户的 Windows `setup.exe` 安装包。`.msi`、代码签名和自动更新都先作为后续工作保留，当前主链路只发布已经通过人工验收的 NSIS 安装包。

## 自动发布链路

仓库包含两条 GitHub Actions 工作流：

- `.github/workflows/ci.yml`：在推送到 `main` 或提交 PR 时运行测试、前端构建、Rust 检查和 Rust 测试。
- `.github/workflows/release.yml`：推送 `v*.*.*` tag 或手动触发时构建 Windows 安装包，并创建草稿 GitHub Release。

Windows 打包配置位于 `src-tauri/tauri.conf.json`：

- `bundle.targets`: `["nsis"]`
- `bundle.windows.webviewInstallMode.type`: `offlineInstaller`

这会产出 NSIS `setup.exe`，并使用离线 WebView2 安装模式，降低普通 Windows 用户首次安装失败概率。

## 校验和与产物保留

Release workflow 会在打包后生成 `SHA256SUMS.txt`：

- 文件内容为每个 `setup.exe` 的 SHA-256 哈希和文件名。
- `SHA256SUMS.txt` 会随安装包一起上传为 workflow artifact。
- `SHA256SUMS.txt` 会随安装包一起附加到草稿 GitHub Release。
- workflow artifact 当前保留 `30` 天，正式分发以 GitHub Release 附件为准。

用户或维护者可以在下载后用以下命令校验安装包：

```powershell
Get-FileHash .\GPT-Image-2-Studio_0.1.0_x64-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## 本地发布前检查

```powershell
npm run release:check
npm run test:run
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run release:check` 会检查：

- Release workflow 是否支持 tag 触发和手动触发。
- Release workflow 是否在 Windows 上构建安装包。
- Release workflow 是否生成并发布 `SHA256SUMS.txt`。
- Release workflow 是否设置 artifact 保留天数。
- Release workflow 是否上传安装包并创建 GitHub Release。
- Tauri Windows 打包是否启用 `offlineInstaller`。
- 仓库文本文件中是否出现真实形态的 `sk-` API key。

## 发版步骤

1. 确认 `main` 分支已经包含要发布的代码。
2. 如需变更版本号，同步更新 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml`。
3. 运行本地发布前检查。
4. 提交版本变更。
5. 创建并推送 tag。

```powershell
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

6. 打开 GitHub Actions，等待 `Release` workflow 完成。
7. 打开 GitHub Releases，检查草稿 Release 中的 `setup.exe` 和 `SHA256SUMS.txt`。
8. 下载 `setup.exe`，按 [release-checklist.md](./release-checklist.md) 做人工验收。
9. 人工验收通过后发布草稿 Release。

## 暂缓项

- `.msi`：先不加入首版主链路，避免同时维护两套安装包验收路径。
- 代码签名：后续用于降低 Windows SmartScreen 拦截概率。
- 自动更新：需要先明确签名、发布通道和回滚策略，本期不接入 updater。

参考：

- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [GitHub Actions Releases](https://docs.github.com/actions)
