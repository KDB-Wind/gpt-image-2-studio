// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  checkPackageReleaseMetadata,
  checkReleaseWorkflow,
  checkPagesWorkflow,
  checkTauriWindowsBundleConfig,
  findSensitivePatterns,
  runReleaseReadiness,
} from "./release-readiness.mjs";

describe("release readiness checks", () => {
  it("requires package, Tauri, Cargo.toml, and Cargo.lock versions to agree", () => {
    const packageJson = { version: "1.2.3", license: "MIT" };
    const packageLock = {
      version: "1.2.3",
      packages: { "": { version: "1.2.3", license: "MIT" } },
    };
    const tauriConfig = { version: "1.2.2" };
    const cargoToml = '[package]\nname = "chat-to-image"\nversion = "1.2.1"\n';
    const cargoLock = '[[package]]\nname = "chat-to-image"\nversion = "1.2.0"\n';

    expect(checkPackageReleaseMetadata(packageJson, packageLock, tauriConfig, cargoToml, cargoLock)).toEqual(
      expect.arrayContaining([
        "src-tauri/tauri.conf.json version must match package.json.",
        "src-tauri/Cargo.toml package version must match package.json.",
        "src-tauri/Cargo.lock package version must match package.json.",
      ]),
    );
  });

  it("keeps every release metadata source on the current package version", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
    const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8");

    expect(checkPackageReleaseMetadata(packageJson, packageLock, tauriConfig, cargoToml, cargoLock)).toEqual([]);
  });

  it("marks the remaining July 6 plans as historical", () => {
    const historicalPlans = [
      "2026-07-06-static-html-page-e2e-automation-and-save-dir.md",
      "2026-07-06-static-html-e2e-remediation.md",
      "2026-07-06-static-html-e2e-page-hardening.md",
      "2026-07-06-static-html-e2e-hardening.md",
    ];

    for (const fileName of historicalPlans) {
      const contents = readFileSync(join("docs", "superpowers", "plans", fileName), "utf8");
      expect(contents).toContain("本文已被 2026-07-11 独立审计与修复取代");
    }
  });

  it("requires MIT package metadata and matching lockfile release metadata", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));

    expect(packageJson.license).toBe("MIT");
    expect(packageLock.version).toBe(packageJson.version);
    expect(packageLock.packages[""].version).toBe(packageJson.version);
    expect(packageLock.packages[""].license).toBe("MIT");
    expect(existsSync(join("docs", "release-notes", `v${packageJson.version}.md`))).toBe(true);
  });

  it("accepts release metadata derived from package.json and rejects tag mismatches", () => {
    const workflow = `
on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - name: Resolve release metadata
        id: release_metadata
        shell: pwsh
        run: |
          $version = node -p "require('./package.json').version"
          $tag = "\${{ github.ref_name }}"
          $expectedTag = "v$version"
          if ($tag -ne $expectedTag) { throw "Release tag $tag does not match package version $expectedTag." }
          $releaseNotes = "docs/release-notes/v$version.md"
          if (-not (Test-Path -LiteralPath $releaseNotes)) { throw "Release notes are missing: $releaseNotes" }
          "tag=$tag" | Out-File -FilePath $env:GITHUB_OUTPUT -Append
          "version=$version" | Out-File -FilePath $env:GITHUB_OUTPUT -Append
          "release_notes=$releaseNotes" | Out-File -FilePath $env:GITHUB_OUTPUT -Append
      - run: npm run release:check
      - run: npm run test:run
      - run: npm run build
      - run: npm run build:static
      - run: npm run desktop:build
      - run: npm run secret:scan
      - run: Get-FileHash dist-static/gpt-image-2-studio-lite.html | Set-Content SHA256SUMS.txt
      - uses: actions/upload-artifact@v4
        with:
          retention-days: 30
          path: |
            dist-static/gpt-image-2-studio-lite.html
            SHA256SUMS.txt
      - uses: softprops/action-gh-release@v2
        with:
          body_path: \${{ steps.release_metadata.outputs.release_notes }}
          files: |
            dist-static/gpt-image-2-studio-lite.html
            SHA256SUMS.txt
`;

    expect(checkReleaseWorkflow(workflow)).toEqual([]);
  });

  it("rejects a hard-coded release-notes path", () => {
    const workflow = `
on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - name: Resolve release metadata
        id: release_metadata
        run: |
          $version = node -p "require('./package.json').version"
          $tag = "\${{ github.ref_name }}"
          $expectedTag = "v$version"
          if ($tag -ne $expectedTag) { throw "tag mismatch" }
          $releaseNotes = "docs/release-notes/v$version.md"
          if (-not (Test-Path -LiteralPath $releaseNotes)) { throw "notes missing" }
          "release_notes=$releaseNotes" | Out-File -FilePath $env:GITHUB_OUTPUT -Append
      - run: npm run release:check
      - run: npm run test:run
      - run: npm run build
      - run: npm run build:static
      - run: npm run desktop:build
      - run: npm run secret:scan
      - run: Get-FileHash dist-static/gpt-image-2-studio-lite.html | Set-Content SHA256SUMS.txt
      - uses: actions/upload-artifact@v4
        with:
          retention-days: 30
          path: |
            dist-static/gpt-image-2-studio-lite.html
            SHA256SUMS.txt
      - uses: softprops/action-gh-release@v2
        with:
          body_path: docs/release-notes/v9.8.7.md
          files: |
            dist-static/gpt-image-2-studio-lite.html
            SHA256SUMS.txt
`;

    expect(checkReleaseWorkflow(workflow)).toContain(
      "Release workflow must derive the release-notes path from package metadata.",
    );
  });

  it("accepts a Windows release workflow that builds and publishes Tauri bundles", () => {
    const workflow = `
name: Release
on:
  push:
    tags:
      - "v*.*.*"
  workflow_dispatch:
permissions:
  contents: write
jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - name: Resolve release metadata
        id: release_metadata
        run: |
          $version = node -p "require('./package.json').version"
          $tag = "\${{ github.ref_name }}"
          $expectedTag = "v$version"
          if ($tag -ne $expectedTag) { throw "tag mismatch" }
          $releaseNotes = "docs/release-notes/v$version.md"
          if (-not (Test-Path -LiteralPath $releaseNotes)) { throw "notes missing" }
          "release_notes=$releaseNotes" | Out-File -FilePath $env:GITHUB_OUTPUT -Append
      - run: npm run release:check
      - run: npm run test:run
      - run: npm run build
      - run: npm run build:static
      - run: npm run desktop:build
      - run: npm run secret:scan
      - name: Generate installer checksums
        run: |
          Get-FileHash src-tauri/target/release/bundle/nsis/*.exe, dist-static/gpt-image-2-studio-lite.html -Algorithm SHA256 |
            ForEach-Object { "$($_.Hash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($_.Path))" } |
            Set-Content SHA256SUMS.txt
      - uses: actions/upload-artifact@v4
        with:
          retention-days: 30
          path: |
            src-tauri/target/release/bundle/nsis/*.exe
            dist-static/gpt-image-2-studio-lite.html
            SHA256SUMS.txt
      - uses: softprops/action-gh-release@v2
        with:
          body_path: \${{ steps.release_metadata.outputs.release_notes }}
          files: |
            src-tauri/target/release/bundle/nsis/*.exe
            dist-static/gpt-image-2-studio-lite.html
            SHA256SUMS.txt
`;

    expect(checkReleaseWorkflow(workflow, "0.1.2")).toEqual([]);
  });

  it("accepts a GitHub Pages workflow that publishes dist-static", () => {
    const workflow = `
name: Pages
on:
  push:
    branches:
      - main
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run release:check
      - run: npm run test:run
      - run: npm run build:static
      - run: npm run site:check
      - run: npm run secret:scan
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist-static
  deploy:
    steps:
      - uses: actions/deploy-pages@v4
`;

    expect(checkPagesWorkflow(workflow)).toEqual([]);
  });

  it("rejects a Pages workflow that scans only before the static build", () => {
    const workflow = `
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
  - run: npm ci
  - run: npm run secret:scan
  - run: npm run release:check
  - run: npm run test:run
  - run: npm run build:static
  - run: npm run site:check
  - uses: actions/upload-pages-artifact@v3
    with:
      path: dist-static
  - uses: actions/deploy-pages@v4
`;

    expect(checkPagesWorkflow(workflow)).toContain(
      "Pages workflow must scan built static artifacts before upload.",
    );
  });

  it("rejects a Release workflow that scans only before release assets are built", () => {
    const workflow = `
on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - run: npm run secret:scan
      - run: npm run release:check
      - run: npm run test:run
      - run: npm run build
      - run: npm run build:static
      - run: npm run desktop:build
      - run: Get-FileHash dist-static/gpt-image-2-studio-lite.html | Set-Content SHA256SUMS.txt
      - uses: actions/upload-artifact@v4
        with:
          retention-days: 30
          path: |
            dist-static/gpt-image-2-studio-lite.html
            SHA256SUMS.txt
      - uses: softprops/action-gh-release@v2
        with:
          body_path: docs/release-notes/v0.1.2.md
          files: |
            dist-static/gpt-image-2-studio-lite.html
            SHA256SUMS.txt
`;

    expect(checkReleaseWorkflow(workflow, "0.1.2")).toContain(
      "Release workflow must scan built release assets before checksums and upload.",
    );
  });

  it("requires checksums and bounded artifact retention for installer releases", () => {
    const workflow = `
name: Release
on:
  push:
    tags:
      - "v*.*.*"
  workflow_dispatch:
permissions:
  contents: write
jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - run: npm run release:check
      - run: npm run test:run
      - run: npm run build
      - run: npm run desktop:build
      - uses: actions/upload-artifact@v4
      - uses: softprops/action-gh-release@v2
        with:
          body_path: docs/release-notes/v0.1.2.md
          files: |
            src-tauri/target/release/bundle/nsis/*.exe
`;

    expect(checkReleaseWorkflow(workflow, "0.1.2")).toEqual(
      expect.arrayContaining([
        "Release workflow must generate SHA256SUMS.txt for Windows installer assets.",
        "Release workflow must build the single-file HTML release asset.",
        "Release workflow must upload the single-file HTML release asset.",
        "Release workflow must attach the single-file HTML asset to the draft GitHub Release.",
        "Release workflow must upload SHA256SUMS.txt as a workflow artifact.",
        "Release workflow must attach SHA256SUMS.txt to the draft GitHub Release.",
        "Release workflow must set artifact retention-days for installer artifacts.",
        "Release workflow must run the unified secret scan.",
      ]),
    );
  });

  it("requires Windows offline WebView2 and setup.exe bundle support", () => {
    const config = {
      bundle: {
        targets: ["nsis"],
        windows: {
          webviewInstallMode: {
            type: "offlineInstaller",
          },
        },
      },
    };

    expect(checkTauriWindowsBundleConfig(config)).toEqual([]);
  });

  it("flags tracked files that contain real-looking API keys", () => {
    const fakeKey = "sk-" + "123456789012345678901234567890";
    const findings = findSensitivePatterns({
      "README.md": "API key is intentionally blank.",
      "src/example.ts": `const key = '${fakeKey}';`,
    });

    expect(findings).toEqual(["src/example.ts: openai-like-key"]);
  });

  it("keeps the repository release chain ready", () => {
    expect(runReleaseReadiness(process.cwd())).toEqual([]);
  });
});
