# Releasing Windows Installers

The public release target for this repository is a Windows `setup.exe` installer for normal users. `.msi`, code signing, and automatic updates are deferred; the current release chain publishes only the manually verified NSIS installer.

## Automated Release Chain

The repository includes two GitHub Actions workflows:

- `.github/workflows/ci.yml`: runs tests, frontend build, Rust check, and Rust tests on pushes to `main` and pull requests.
- `.github/workflows/release.yml`: builds Windows installers and creates a draft GitHub Release when a `v*.*.*` tag is pushed or the workflow is manually triggered.

Windows bundling is configured in `src-tauri/tauri.conf.json`:

- `bundle.targets`: `["nsis"]`
- `bundle.windows.webviewInstallMode.type`: `offlineInstaller`

This produces the NSIS `setup.exe` output and uses the offline WebView2 installer mode to reduce first-time setup failures on Windows.

## Checksums And Artifact Retention

The Release workflow generates `SHA256SUMS.txt` after packaging:

- The file contains the SHA-256 hash and file name for each `setup.exe`.
- `SHA256SUMS.txt` is uploaded with the installer workflow artifact.
- `SHA256SUMS.txt` is attached to the draft GitHub Release with the installer.
- Workflow artifacts are retained for `30` days. Long-term distribution should use the GitHub Release assets.

Maintainers and users can verify a downloaded installer with:

```powershell
Get-FileHash .\GPT-Image-2-Studio_0.1.0_x64-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## Local Pre-Release Checks

```powershell
npm run release:check
npm run test:run
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run release:check` verifies:

- the Release workflow supports tag and manual triggers
- the Release workflow builds installers on Windows
- the Release workflow generates and publishes `SHA256SUMS.txt`
- the Release workflow sets artifact retention days
- the Release workflow uploads installers and creates a GitHub Release
- Tauri Windows bundling uses `offlineInstaller`
- tracked text files do not contain a real-looking `sk-` API key

## Release Steps

1. Confirm `main` contains the code you want to publish.
2. If the version changes, update `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
3. Run the local pre-release checks.
4. Commit the version changes.
5. Create and push the tag.

```powershell
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

6. Open GitHub Actions and wait for the `Release` workflow to finish.
7. Open GitHub Releases and review the draft `setup.exe` and `SHA256SUMS.txt` assets.
8. Download `setup.exe` and run the manual QA checklist in [release-checklist.md](./release-checklist.md).
9. Publish the draft Release after manual QA passes.

## Deferred Items

- `.msi`: deferred to avoid maintaining two installer QA paths in the first release.
- Code signing: future work to reduce Windows SmartScreen warnings.
- Automatic updates: deferred until signing, release channels, and rollback policy are defined.

References:

- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [GitHub Actions Releases](https://docs.github.com/actions)
