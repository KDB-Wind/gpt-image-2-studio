# Release Guide

This repository releases only the public local basic tool. It does not publish platform code, platform deployment files, admin backend code, or hosted-key infrastructure.

## Release Assets

Each Release should include two user-facing assets:

- `gpt-image-2-studio-lite.html`: single-file HTML that opens directly in a browser.
- Windows `setup.exe`: desktop installer for longer-term use.

`SHA256SUMS.txt` records SHA-256 checksums for Release assets.

## Local Pre-Release Checks

Set the external immutable trust root before running strict or historical archive checks. The current intended public repository commit is `31774ff698abd999f107e40c49d3de43da5a5f35`, the first trusted commit containing the complete `v0.1.7` archive and trust-root implementation.

```powershell
$env:STATIC_ARCHIVE_TRUSTED_BASE = "<FULL_TRUSTED_COMMIT_SHA>"
npm run release:check
npm run test:run
npm run build
npm run build:static
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

If Rust is unavailable on the current machine, complete the frontend and static HTML checks locally, then rely on a Rust-ready machine or GitHub Actions for desktop checks.

## Archive Anchor

The trust root is not stored in this repository. Strict release and historical Pages parity require `STATIC_ARCHIVE_TRUSTED_BASE` to contain a full immutable commit SHA supplied outside the ref being validated. Missing, empty, malformed, unresolved, or non-ancestor values fail closed; there is no `HEAD^` or tracked-configuration fallback.

Every version listed by that external base manifest is immutable, including its `latestStable`. Only versions absent from the base may be added as a new release archive. CI and Pages push events additionally compare their event or merge base, without replacing the external trust root.

## GitHub Repository Setup

Before enabling CI, Pages, or Release, open **Settings > Secrets and variables > Actions > Variables** and create `STATIC_ARCHIVE_TRUSTED_BASE` with the full trusted commit SHA. The current intended value is `31774ff698abd999f107e40c49d3de43da5a5f35`. Workflows fail early with a setup error when this variable is missing or invalid; workflow inputs are not accepted as the trust root.

After every stable archive or Release, advance the Repository Variable to a trusted commit that already contains that stable archive before preparing later releases. The trusted commit may remain an ancestor of a later `HEAD`. This guide records the intended value only; it does not claim the external GitHub variable has already been changed.

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
git tag v0.1.7
git push origin main
git push origin v0.1.7
```

3. Wait for `.github/workflows/release.yml`.
4. Open GitHub Releases and review the draft Release.
5. Download `gpt-image-2-studio-lite.html` and `setup.exe` for manual QA.
6. Publish the draft Release after QA passes.

You can also use `workflow_dispatch` to trigger the Release workflow manually and provide `tag_name`. This is only a rerun or controlled dispatch path: the matching tag must already exist remotely, and it does not create a missing tag.

## Verify Downloads

```powershell
Get-FileHash .\gpt-image-2-studio-lite.html -Algorithm SHA256
Get-FileHash .\GPT-Image-2-Studio_0.1.7_x64-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## Deferred Items

- `.msi`: deferred to avoid maintaining two installer QA paths.
- Code signing: future work to reduce Windows SmartScreen warnings.
- Automatic updates: deferred until signing, release channels, and rollback policy are defined.
