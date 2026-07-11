// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  checkReleaseWorkflow,
  checkPagesWorkflow,
  checkTauriWindowsBundleConfig,
  findSensitivePatterns,
  runReleaseReadiness,
} from "./release-readiness.mjs";

describe("release readiness checks", () => {
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
          body_path: docs/release-notes/v0.1.2.md
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
