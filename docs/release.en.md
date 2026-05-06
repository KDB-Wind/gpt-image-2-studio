# Releasing Windows Installers

The public release target for this repository is a `setup.exe` installer for normal users. `.msi` can be added later, but the first release chain only publishes the locally verified NSIS installer.

## Automated Release Chain

The repository includes two GitHub Actions workflows:

- `.github/workflows/ci.yml`: runs tests, frontend build, Rust check, and Rust tests on pushes to `main` and pull requests.
- `.github/workflows/release.yml`: builds Windows installers and creates a draft GitHub Release when a `v*.*.*` tag is pushed or the workflow is manually triggered.

Windows bundling is configured in `src-tauri/tauri.conf.json`:

- `bundle.targets`: `["nsis"]`
- `bundle.windows.webviewInstallMode.type`: `offlineInstaller`

This produces the NSIS `setup.exe` output and includes WebView2 installation support in the installer flow, reducing setup failures for first-time Windows users.

The first Release draft body comes from:

- `docs/release-notes/v0.1.0.md`

The first manual QA checklist comes from:

- `docs/release-checklist.md`

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
- the Release workflow uploads installers and creates a GitHub Release
- Tauri Windows bundling uses `offlineInstaller`
- tracked text files do not contain a real-looking `sk-` API key

## Release Steps

1. Confirm `main` contains the code you want to publish.
2. If the version changes, update `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
3. Run the local pre-release checks.
4. Commit the version changes.
5. Create and push the tag:

```powershell
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

6. Open GitHub Actions and wait for the `Release` workflow to finish.
7. Open GitHub Releases and review the draft `.exe` asset.
8. Download `setup.exe` and run the manual QA checklist in `docs/release-checklist.md`.
9. Publish the draft Release after manual QA passes.

## Manual Dispatch

You can also run the `Release` workflow manually from GitHub Actions and enter a tag such as `v0.1.0`. This is useful when regenerating installers or validating the packaging chain.

## Download Guidance

README and Release notes should point normal users to the `setup.exe` installer. Source-based usage is mainly for developers.

References:

- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [GitHub Actions Releases](https://docs.github.com/actions)
