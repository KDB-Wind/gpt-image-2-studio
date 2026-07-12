// @vitest-environment node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  checkPackageReleaseMetadata,
  checkCiWorkflow,
  checkManualReleaseDocumentation,
  checkReleaseWorkflow,
  checkPagesWorkflow,
  checkTauriWindowsBundleConfig,
  findSensitivePatterns,
  runReleaseReadiness,
} from "./release-readiness.mjs";

describe("release readiness checks", () => {
  it("makes release:check independently reject current release bytes that differ from the archive", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "chat-to-image-release-parity-"));
    const archiveHtml = "<html>immutable release</html>\n";
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const parityScript = join(process.cwd(), "scripts", "release-archive-parity.mjs");

    writeFixtureJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeFixtureJson(join(rootDir, "static-versions", "manifest.json"), {
      latestStable: "1.2.3",
      versions: ["1.2.3"],
      sha256: {
        "1.2.3": createHash("sha256").update(archiveHtml).digest("hex"),
      },
    });
    writeFixtureFile(
      join(rootDir, "static-versions", "versions", "v1.2.3", "index.html"),
      archiveHtml,
    );
    writeFixtureFile(join(rootDir, "dist-static", "versions", "v1.2.3", "index.html"), archiveHtml);
    writeFixtureFile(join(rootDir, "dist-static", "index.html"), "<html>mismatched release</html>\n");
    writeFixtureFile(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), archiveHtml);
    for (const args of [
      ["init"],
      ["config", "core.autocrlf", "false"],
      ["config", "user.email", "release-test@example.invalid"],
      ["config", "user.name", "Release Test"],
      ["add", "--", "package.json", "static-versions/manifest.json", "static-versions/versions/v1.2.3/index.html"],
      ["commit", "-m", "fixture release"],
    ]) {
      const gitResult = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
      expect(gitResult.status).toBe(0);
    }

    const result = spawnSync(process.execPath, [parityScript, "--strict"], {
      cwd: rootDir,
      encoding: "utf8",
    });

    expect(packageJson.scripts["release:check"]).toContain("node scripts/release-archive-parity.mjs --strict");
    expect(packageJson.scripts["release:check"]).toContain("node scripts/clean-static-repro-check.mjs");
    expect(packageJson.scripts["release:check"]).not.toContain("npm run site:check");
    expect(packageJson.scripts["pages:check"]).toContain("node scripts/release-readiness.mjs");
    expect(packageJson.scripts["pages:check"]).toContain("node scripts/release-archive-parity.mjs --historical-only");
    expect(packageJson.scripts["artifact:check"]).toBe("node scripts/check-runtime-bundle-isolation.mjs");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/current release index\.html.*byte-identical/i);
  });

  it("requires release documentation to state that manual dispatch only reruns an existing remote tag", () => {
    const documents = {
      [join("docs", "release-checklist.md")]: readFileSync("docs/release-checklist.md", "utf8"),
      [join("docs", "release.md")]: readFileSync("docs/release.md", "utf8"),
      [join("docs", "release.en.md")]: readFileSync("docs/release.en.md", "utf8"),
    };

    expect(checkManualReleaseDocumentation(documents)).toEqual([]);

    documents[join("docs", "release.en.md")] =
      "You can use workflow_dispatch and provide tag_name to publish a release.";
    expect(checkManualReleaseDocumentation(documents)).toEqual([
      expect.stringMatching(/release\.en\.md.*workflow_dispatch only reruns an existing remote tag/),
    ]);
  });

  it("keeps untrusted dispatch tags out of shell script bodies", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    const runBodies = [...workflow.matchAll(/\brun:\s*\|\s*\n((?:\s{10,}.*(?:\r?\n|$))*)/g)].map((match) => match[1]);

    expect(runBodies.join("\n")).not.toContain("${{ inputs.tag_name }}");

    for (const payload of ['v1.2.3"; Write-Output injected; #', "v1.2.3'; Write-Output injected; #"]) {
      const unsafeWorkflow = workflow.replace(
        "$tag = if ($env:EVENT_NAME -eq \"workflow_dispatch\") { $env:DISPATCH_TAG } else { $env:REF_NAME }",
        `$tag = "\${{ inputs.tag_name }}" # ${payload}`,
      );
      expect(checkReleaseWorkflow(unsafeWorkflow)).toContain(
        "Release workflow must not interpolate untrusted GitHub expressions inside shell script bodies.",
      );
    }
  });

  it("checks out and verifies the validated tag commit before building", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");

    expect(workflow).toMatch(/ref:\s*refs\/tags\/\$\{\{\s*needs\.[^.]+\.outputs\.tag\s*\}\}/);
    expect(workflow).toMatch(/git rev-parse HEAD[\s\S]*git rev-list -n 1/);
    expect(checkReleaseWorkflow(workflow)).toEqual([]);
    expect(checkReleaseWorkflow(workflow.replace("npm run artifact:check", "npm run site:check"))).toContain(
      "Release workflow must inspect built normal and static artifacts for runtime isolation.",
    );

    const branchHeadWorkflow = workflow.replace(
      "ref: refs/tags/${{ needs.release-metadata.outputs.tag }}",
      "ref: main",
    );
    expect(checkReleaseWorkflow(branchHeadWorkflow)).toContain(
      "Release workflow must check out the validated tag ref.",
    );
  });

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
    expect(packageJson.scripts["secret:scan:release"]).toBe("node scripts/secret-scan.mjs --release-artifacts");
    expect(existsSync(join("docs", "release-notes", `v${packageJson.version}.md`))).toBe(true);
  });

  it("accepts package-derived release metadata and evaluates a tag-validation mutation", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    const invalidWorkflow = workflow.replace(
      "$env:RELEASE_TAG -ne $expectedTag",
      "$env:RELEASE_TAG -eq $expectedTag",
    );

    expect(checkReleaseWorkflow(workflow)).toEqual([]);
    expect(checkReleaseWorkflow(invalidWorkflow)).toContain(
      "Release workflow must fail when the tag does not match v<package version>.",
    );
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

  it("accepts the Windows release workflow and evaluates a desktop-build mutation", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    const invalidWorkflow = workflow.replace("npm run desktop:build", "echo skipped-desktop-build");

    expect(checkReleaseWorkflow(workflow)).toEqual([]);
    expect(checkReleaseWorkflow(invalidWorkflow)).toContain(
      "Release workflow must build Tauri desktop bundles.",
    );
  });

  it("rejects an invalid release workflow fixture as a sentinel", () => {
    expect(checkReleaseWorkflow("name: invalid fixture\n")).toContain(
      "Release workflow must trigger on v*.*.* tags.",
    );
  });

  it("requires static site and both static E2E gates before release upload", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8")
      .replace("npm run site:check", "echo skipped-site-check")
      .replace("npm run e2e:static:mock:run", "echo skipped-mock-e2e")
      .replace("npm run e2e:static:file:run", "echo skipped-file-e2e");

    expect(checkReleaseWorkflow(workflow)).toEqual(expect.arrayContaining([
      "Release workflow must check the built static site.",
      "Release workflow must run mock static E2E tests.",
      "Release workflow must run file-mode static E2E tests.",
    ]));
  });

  it("requires a final strict parity gate after desktop packaging and immediately before checksums", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    const finalStrictStep = `      - name: Final strict release parity\n        env:\n          RELEASE_VERSION: \${{ steps.release_metadata.outputs.version }}\n        run: node scripts/release-archive-parity.mjs --strict\n\n`;
    const validWorkflow = workflow;

    expect(checkReleaseWorkflow(validWorkflow)).toEqual([]);
    expect(checkReleaseWorkflow(workflow.replace(finalStrictStep, ""))).toContain(
      "Release workflow must run final strict parity after desktop packaging and before checksums.",
    );

    const missingFinalVersionInput = workflow.replace(
      "      - name: Final strict release parity\n        env:\n          RELEASE_VERSION: ${{ steps.release_metadata.outputs.version }}\n",
      "      - name: Final strict release parity\n",
    );
    expect(checkReleaseWorkflow(missingFinalVersionInput)).toContain(
      "Release workflow must pass the resolved release version into both strict parity gates.",
    );

    const earlyStrictWorkflow = workflow.replace(finalStrictStep, "").replace(
      "      - name: Build Windows installers\n",
      `${finalStrictStep}      - name: Build Windows installers\n`,
    );
    expect(checkReleaseWorkflow(earlyStrictWorkflow)).toContain(
      "Release workflow must run final strict parity after desktop packaging and before checksums.",
    );

    const modifyingCommandWorkflow = validWorkflow.replace(
      finalStrictStep,
      `${finalStrictStep}      - name: Rebuild after parity\n        run: npm run build:static\n\n`,
    );
    expect(checkReleaseWorkflow(modifyingCommandWorkflow)).toContain(
      "Release workflow must not run modifying commands between final strict parity, checksums, and upload.",
    );

    const postChecksumModificationWorkflow = validWorkflow.replace(
      "      - name: Upload Windows installer artifact\n",
      "      - name: Rewrite release bytes after checksums\n        run: npm run build:static\n\n      - name: Upload Windows installer artifact\n",
    );
    expect(checkReleaseWorkflow(postChecksumModificationWorkflow)).toContain(
      "Release workflow must not run modifying commands between final strict parity, checksums, and upload.",
    );

    const postUploadModificationWorkflow = validWorkflow.replace(
      "      - name: Create draft GitHub Release\n",
      "      - name: Rewrite after artifact upload\n        run: npm run build:static\n\n      - name: Create draft GitHub Release\n",
    );
    expect(checkReleaseWorkflow(postUploadModificationWorkflow)).toContain(
      "Release workflow must not run modifying commands between final strict parity, checksums, and upload.",
    );
  });

  it("requires Release to use the external trusted base instead of HEAD^", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    const headFallbackWorkflow = workflow.replace(
      "STATIC_ARCHIVE_TRUSTED_BASE: ${{ vars.STATIC_ARCHIVE_TRUSTED_BASE }}",
      "STATIC_ARCHIVE_TRUSTED_BASE: HEAD^",
    );

    expect(checkReleaseWorkflow(headFallbackWorkflow)).toContain(
      "Release workflow must source STATIC_ARCHIVE_TRUSTED_BASE only from vars.STATIC_ARCHIVE_TRUSTED_BASE.",
    );
  });

  it("keeps the archive trust root external to repository files and workflow inputs", () => {
    expect(existsSync(join("static-versions", "release-config.json"))).toBe(false);

    for (const workflowPath of [
      join(".github", "workflows", "ci.yml"),
      join(".github", "workflows", "pages.yml"),
      join(".github", "workflows", "release.yml"),
    ]) {
      const workflow = readFileSync(workflowPath, "utf8");
      expect(workflow).toContain("STATIC_ARCHIVE_TRUSTED_BASE: ${{ vars.STATIC_ARCHIVE_TRUSTED_BASE }}");
      expect(workflow).toMatch(/Repository variable STATIC_ARCHIVE_TRUSTED_BASE is required/i);
      expect(workflow).not.toContain("static-versions/release-config.json");
      expect(workflow).not.toContain("STATIC_ARCHIVE_BASE_REF");
      expect(workflow).not.toMatch(/inputs\.(?:archive|trusted).*base/i);
    }
  });

  it("rejects repository scripts or workflow shell bodies that override the external trust root", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
    const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8");
    packageJson.scripts["release:check"] = `$env:STATIC_ARCHIVE_TRUSTED_BASE='${"f".repeat(40)}'; ${packageJson.scripts["release:check"]}`;

    expect(checkPackageReleaseMetadata(packageJson, packageLock, tauriConfig, cargoToml, cargoLock)).toContain(
      "package.json release and Pages scripts must not assign STATIC_ARCHIVE_TRUSTED_BASE.",
    );

    for (const [workflowPath, checker, command] of [
      [join(".github", "workflows", "ci.yml"), checkCiWorkflow, "npm run release:check"],
      [join(".github", "workflows", "pages.yml"), checkPagesWorkflow, "npm run pages:check"],
      [join(".github", "workflows", "release.yml"), checkReleaseWorkflow, "npm run release:check"],
    ]) {
      const workflow = readFileSync(workflowPath, "utf8").replace(
        `run: ${command}`,
        `run: $env:STATIC_ARCHIVE_TRUSTED_BASE='${"f".repeat(40)}'; ${command}`,
      );
      expect(checker(workflow)).toContain(
        `${workflowPath.includes("ci.yml") ? "CI" : workflowPath.includes("pages.yml") ? "Pages" : "Release"} workflow must not assign STATIC_ARCHIVE_TRUSTED_BASE inside shell commands.`,
      );
    }
  });

  it("requires CI to resolve an explicit historical archive base for PRs and pushes", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(checkCiWorkflow(workflow)).toEqual([]);
    expect(checkCiWorkflow(workflow.replace("fetch-depth: 0", "fetch-depth: 1"))).toContain(
      "CI checkout must fetch full history for archive immutability.",
    );
    expect(checkCiWorkflow(workflow.replace("git merge-base HEAD origin/main", "git rev-parse HEAD^"))).toContain(
      "PR CI must derive the archive base from merge-base/origin/main.",
    );
    expect(checkCiWorkflow(workflow.replace("npm run artifact:check", "npm run build"))).toContain(
      "CI must inspect built normal and static artifacts for runtime isolation.",
    );
    expect(checkCiWorkflow(workflow.replace("STATIC_ARCHIVE_EVENT_BASE_REF=$baseSha", "STATIC_ARCHIVE_BASE_REF=$baseSha"))).toContain(
      "CI must export the event or merge base separately from the external trusted base.",
    );
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
    env:
      STATIC_ARCHIVE_TRUSTED_BASE: \${{ vars.STATIC_ARCHIVE_TRUSTED_BASE }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Validate external archive trust root
        run: |
          if (-not $env:STATIC_ARCHIVE_TRUSTED_BASE) { throw "Repository variable STATIC_ARCHIVE_TRUSTED_BASE is required." }
          if ($env:STATIC_ARCHIVE_TRUSTED_BASE -notmatch '^[a-f0-9]{40}$') { throw "Invalid trusted base." }
          $resolvedBase = git rev-parse --verify "$env:STATIC_ARCHIVE_TRUSTED_BASE^{commit}"
          if (-not $resolvedBase) { throw "Missing trusted base." }
          git merge-base --is-ancestor $env:STATIC_ARCHIVE_TRUSTED_BASE HEAD
          if ($LASTEXITCODE -ne 0) { throw "Trusted base is not an ancestor." }
      - name: Resolve additional push archive base
        env:
          EVENT_NAME: push
          BEFORE_SHA: abc123
        run: |
          if ($env:EVENT_NAME -eq "push") {
            $baseSha = $env:BEFORE_SHA
            if (-not $baseSha -or $baseSha -match '^0+$') { throw "Missing push base." }
            "STATIC_ARCHIVE_EVENT_BASE_REF=$baseSha" | Out-File -FilePath $env:GITHUB_ENV -Append
          }
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:run
      - run: npm run build
      - run: npm run build:static
      - run: npm run artifact:check
      - run: npm run pages:check
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
    expect(checkPagesWorkflow(workflow.replace("npm run pages:check", "npm run release:check"))).toEqual(
      expect.arrayContaining([
        "Pages workflow must run the non-strict Pages readiness check.",
        "Pages workflow must not run strict release readiness.",
      ]),
    );
    expect(checkPagesWorkflow(workflow.replace("fetch-depth: 0", "fetch-depth: 1"))).toContain(
      "Pages checkout must fetch full history for archive immutability.",
    );
    expect(checkPagesWorkflow(workflow.replace("npm run pages:check", "node scripts/release-readiness.mjs"))).toContain(
      "Pages workflow must run the non-strict Pages readiness check.",
    );
    expect(checkPagesWorkflow(workflow.replace("npm run artifact:check", "npm run build:static"))).toContain(
      "Pages workflow must inspect built normal and static artifacts for runtime isolation.",
    );
    expect(checkPagesWorkflow(workflow.replace(
      "STATIC_ARCHIVE_TRUSTED_BASE: ${{ vars.STATIC_ARCHIVE_TRUSTED_BASE }}",
      "STATIC_ARCHIVE_TRUSTED_BASE: ${{ inputs.archive_base }}",
    ))).toContain(
      "Pages workflow must source STATIC_ARCHIVE_TRUSTED_BASE only from vars.STATIC_ARCHIVE_TRUSTED_BASE.",
    );
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
    with:
      fetch-depth: 0
  - env:
      EVENT_NAME: push
      BEFORE_SHA: abc123
    run: |
      $baseSha = $env:BEFORE_SHA
      if (-not $baseSha -or $baseSha -match '^0+$') { throw "Missing push base." }
      $fallbackBase = git rev-parse HEAD^
      "STATIC_ARCHIVE_BASE_REF=$baseSha" | Out-File -FilePath $env:GITHUB_ENV -Append
  - uses: actions/setup-node@v4
  - run: npm ci
  - run: npm run secret:scan
  - run: npm run pages:check
  - run: npm run test:run
  - run: npm run build
  - run: npm run build:static
  - run: npm run artifact:check
  - run: node scripts/release-archive-parity.mjs --historical-only
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
      "Release workflow must scan frontend release artifacts before desktop packaging.",
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

function writeFixtureJson(path, value) {
  writeFixtureFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFixtureFile(path, contents) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents, "utf8");
}
