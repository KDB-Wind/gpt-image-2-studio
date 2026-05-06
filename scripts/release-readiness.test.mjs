// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  checkReleaseWorkflow,
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
      - run: npm run desktop:build
      - uses: actions/upload-artifact@v4
      - uses: softprops/action-gh-release@v2
        with:
          body_path: docs/release-notes/v0.1.0.md
`;

    expect(checkReleaseWorkflow(workflow)).toEqual([]);
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

    expect(findings).toEqual([
      "src/example.ts contains a real-looking API key pattern.",
    ]);
  });

  it("keeps the repository release chain ready", () => {
    expect(runReleaseReadiness(process.cwd())).toEqual([]);
  });
});
