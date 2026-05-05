# 发布 Windows 安装包

本仓库的公开发布目标是普通用户优先下载 `setup.exe` 安装包。`.msi` 可以后续单独补充，但第一版 Release 链路只发布已经本地验收过的 NSIS 安装包。

## 自动发布链路

GitHub Actions 已包含两条工作流：

- `.github/workflows/ci.yml`: 推送到 `main` 或提交 PR 时运行测试、前端构建、Rust 检查和 Rust 测试。
- `.github/workflows/release.yml`: 推送 `v*.*.*` tag 或手动触发时构建 Windows 安装包，并创建草稿 GitHub Release。

Windows 打包配置位于 `src-tauri/tauri.conf.json`：

- `bundle.targets`: `["nsis"]`
- `bundle.windows.webviewInstallMode.type`: `offlineInstaller`

这会产出 NSIS `setup.exe`，并把 WebView2 安装能力放进安装链路，减少普通 Windows 用户首次安装失败的概率。

## 本地发布前检查

```powershell
npm run release:check
npm run test:run
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run release:check` 会检查：

- Release workflow 是否存在 tag 触发和手动触发。
- Release workflow 是否在 Windows 上构建安装包。
- Release workflow 是否上传安装包并创建 GitHub Release。
- Tauri Windows 打包是否启用 `offlineInstaller`。
- 仓库文本文件中是否出现真实形态的 `sk-` API key。

## 发版步骤

1. 确认 `main` 分支已经包含要发布的代码。
2. 如需变更版本号，同步更新 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml`。
3. 运行本地发布前检查命令。
4. 提交版本变更。
5. 创建并推送 tag：

```powershell
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

6. 打开 GitHub Actions，等待 `Release` workflow 完成。
7. 打开 GitHub Releases，检查草稿 Release 中的 `.exe`。
8. 将 Release 文案补齐后发布。

## 手动触发

也可以在 GitHub Actions 页面手动运行 `Release` workflow，并填写要发布的 tag，例如 `v0.1.0`。适合重新生成安装包或做预发布验证。

## 用户下载建议

README 和 Release 文案中应引导普通用户下载 `setup.exe`。源码运行方式只推荐开发者使用。

参考：

- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [GitHub Actions Releases](https://docs.github.com/actions)
