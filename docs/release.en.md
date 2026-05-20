# Release Guide

This repository releases only the public local basic tool. It does not publish platform code, platform deployment files, admin backend code, or hosted-key infrastructure.

## Release Assets

Each Release should include two user-facing assets:

- `gpt-image-2-studio-lite.html`: single-file HTML that opens directly in a browser.
- Windows `setup.exe`: desktop installer for longer-term use.

`SHA256SUMS.txt` records SHA-256 checksums for Release assets.

## Local Pre-Release Checks

```powershell
npm run release:check
npm run test:run
npm run build
npm run build:static
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

If Rust is unavailable on the current machine, complete the frontend and static HTML checks locally, then rely on a Rust-ready machine or GitHub Actions for desktop checks.

## Single-File HTML

Build:

```powershell
npm run build:static
```

Release asset:

```text
dist-static/gpt-image-2-studio-lite.html
```

Do not publish the repository root `index.html` as the Release asset. It is only the Vite source entry and cannot run by itself.

## Windows Installer

Build:

```powershell
npm run desktop:build
```

Required Tauri Windows settings:

- `bundle.targets` includes `nsis`
- `bundle.windows.webviewInstallMode.type` is `offlineInstaller`

This produces a normal-user `setup.exe`.

## GitHub Actions Release Flow

1. Confirm `main` is a clean public basic-tool tree.
2. Create and push a version tag:

```powershell
git tag v0.1.3
git push origin main
git push origin v0.1.3
```

3. Wait for `.github/workflows/release.yml`.
4. Open GitHub Releases and review the draft Release.
5. Download `gpt-image-2-studio-lite.html` and `setup.exe` for manual QA.
6. Publish the draft Release after QA passes.

You can also trigger the Release workflow manually from GitHub Actions and provide `tag_name`.

## Verify Downloads

```powershell
Get-FileHash .\gpt-image-2-studio-lite.html -Algorithm SHA256
Get-FileHash .\GPT-Image-2-Studio_0.1.3_x64-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## Deferred Items

- `.msi`: deferred to avoid maintaining two installer QA paths.
- Code signing: future work to reduce Windows SmartScreen warnings.
- Automatic updates: deferred until signing, release channels, and rollback policy are defined.
