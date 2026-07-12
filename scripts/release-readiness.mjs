import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { findSecretFindings, formatSecretFinding, scanRepositorySecrets } from "./secret-scan.mjs";

function readText(path) {
  return readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function hasBundleTarget(targets, target) {
  if (targets === "all" || targets === target) {
    return true;
  }

  return Array.isArray(targets) && targets.includes(target);
}

export function findSensitivePatterns(filesByPath) {
  return findSecretFindings(filesByPath).map(formatSecretFinding);
}

function commandIndex(workflowText, command, useLast = false) {
  return useLast ? workflowText.lastIndexOf(command) : workflowText.indexOf(command);
}

function shellScriptBodies(workflowText) {
  const lines = workflowText.split(/\r?\n/);
  const bodies = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*(.*)$/);
    if (!match) {
      continue;
    }

    if (match[2] !== "|") {
      bodies.push(match[2]);
      continue;
    }

    const indentation = match[1].length;
    const body = [];
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim() && line.match(/^\s*/)[0].length <= indentation) {
        index -= 1;
        break;
      }
      body.push(line);
    }
    bodies.push(body.join("\n"));
  }

  return bodies;
}

function commandIndices(workflowText, command) {
  const indices = [];
  let offset = 0;
  while (offset < workflowText.length) {
    const index = workflowText.indexOf(command, offset);
    if (index < 0) {
      break;
    }
    indices.push(index);
    offset = index + command.length;
  }
  return indices;
}

export function checkReleaseWorkflow(workflowText) {
  const checks = [
    [/v\*\.\*\.\*/, "Release workflow must trigger on v*.*.* tags."],
    [/workflow_dispatch:/, "Release workflow must support manual dispatch."],
    [/description:\s*["'].*tag must already exist.*["']/i, "Manual release help must say the tag already exists."],
    [/permissions:\s*[\s\S]*contents:\s*write/, "Release workflow must grant contents: write."],
    [/runs-on:\s*windows-latest/, "Release workflow must build on windows-latest."],
    [/release-metadata:\s*[\s\S]*outputs:\s*[\s\S]*tag:\s*\$\{\{\s*steps\.[^.]+\.outputs\.tag\s*\}\}/, "Release workflow must resolve and expose a validated tag before checkout."],
    [/-notmatch\s+\$semverTagPattern/, "Release workflow must strictly validate the requested v<SemVer> tag."],
    [/\\Av\(0\|\[1-9\]\\d\*\)[\s\S]*\\z/, "Release workflow must use strict SemVer tag validation."],
    [/actions\/checkout@v4/, "Release workflow must check out the repository."],
    [/ref:\s*refs\/tags\/\$\{\{\s*needs\.[^.]+\.outputs\.tag\s*\}\}/, "Release workflow must check out the validated tag ref."],
    [/git rev-parse HEAD[\s\S]*git rev-list -n 1/, "Release workflow must verify checked-out HEAD equals the validated tag commit."],
    [/actions\/setup-node@v4/, "Release workflow must install Node.js."],
    [/dtolnay\/rust-toolchain@stable/, "Release workflow must install Rust stable."],
    [/npm ci/, "Release workflow must install dependencies with npm ci."],
    [/node -p ["']require\(["']\.\/package\.json["']\)\.version["']/, "Release workflow must read the version from package.json."],
    [/\$expectedTag\s*=\s*["']v\$version["']/, "Release workflow must derive the expected tag from the package version."],
    [/\$env:RELEASE_TAG\s*-ne\s*\$expectedTag/, "Release workflow must fail when the tag does not match v<package version>."],
    [/\$releaseNotes\s*=\s*["']docs\/release-notes\/v\$version\.md["']/, "Release workflow must derive the release-notes path from package metadata."],
    [/Test-Path\s+-LiteralPath\s+\$releaseNotes/, "Release workflow must fail when derived release notes are missing."],
    [/release_notes=\$releaseNotes/, "Release workflow must expose the derived release-notes path."],
    [/base_sha=\$baseSha/, "Release workflow must expose an explicit prior commit for archive immutability."],
    [/npm run secret:scan/, "Release workflow must run the unified secret scan."],
    [/npm run secret:scan:release/, "Release workflow must scan ignored release artifacts."],
    [/npm run release:check/, "Release workflow must run the release readiness check."],
    [/node scripts\/release-archive-parity\.mjs --strict/, "Release workflow must run a final strict archive parity gate."],
    [/npm run test:run/, "Release workflow must run tests before packaging."],
    [/npm run build/, "Release workflow must build the frontend before packaging."],
    [/npm run build:static/, "Release workflow must build the single-file HTML release asset."],
    [/npm run site:check/, "Release workflow must check the built static site."],
    [/npm run e2e:static:mock:run/, "Release workflow must run mock static E2E tests."],
    [/npm run e2e:static:file:run/, "Release workflow must run file-mode static E2E tests."],
    [/npm run desktop:build/, "Release workflow must build Tauri desktop bundles."],
    [/Get-FileHash[\s\S]*SHA256SUMS\.txt/, "Release workflow must generate SHA256SUMS.txt for Windows installer assets."],
    [/actions\/upload-artifact@v4/, "Release workflow must upload installer artifacts."],
    [/actions\/upload-artifact@v4[\s\S]*path:\s*\|[\s\S]*dist-static\/gpt-image-2-studio-lite\.html/, "Release workflow must upload the single-file HTML release asset."],
    [/actions\/upload-artifact@v4[\s\S]*path:\s*\|[\s\S]*SHA256SUMS\.txt/, "Release workflow must upload SHA256SUMS.txt as a workflow artifact."],
    [/actions\/upload-artifact@v4[\s\S]*retention-days:\s*\d+/, "Release workflow must set artifact retention-days for installer artifacts."],
    [/softprops\/action-gh-release@v2/, "Release workflow must create or update a GitHub Release."],
    [/tag_name:\s*\$\{\{\s*needs\.[^.]+\.outputs\.tag\s*\}\}/, "Release workflow must publish the same validated tag that was checked out."],
    [/body_path:\s*\$\{\{\s*steps\.release_metadata\.outputs\.release_notes\s*\}\}/, "Release workflow must use the derived release-notes path."],
    [/softprops\/action-gh-release@v2[\s\S]*files:\s*\|[\s\S]*dist-static\/gpt-image-2-studio-lite\.html/, "Release workflow must attach the single-file HTML asset to the draft GitHub Release."],
    [/softprops\/action-gh-release@v2[\s\S]*files:\s*\|[\s\S]*SHA256SUMS\.txt/, "Release workflow must attach SHA256SUMS.txt to the draft GitHub Release."],
  ];

  const errors = checks
    .filter(([pattern]) => !pattern.test(workflowText))
    .map(([, message]) => message);

  if (/body_path:\s*docs\/release-notes\/v[^\s]+\.md/.test(workflowText)) {
    errors.push("Release workflow must derive the release-notes path from package metadata.");
  }

  if (shellScriptBodies(workflowText).some((body) => /\$\{\{\s*(?:inputs\.|github\.event\.|github\.ref_name)/.test(body))) {
    errors.push("Release workflow must not interpolate untrusted GitHub expressions inside shell script bodies.");
  }

  const resolverJob = workflowText.match(/\n  release-metadata:\s*\n([\s\S]*?)(?=\n  [A-Za-z0-9_-]+:\s*\n)/)?.[1] ?? "";
  if (!resolverJob || /actions\/checkout@/.test(resolverJob)) {
    errors.push("Release tag resolution must run without checking out repository content.");
  }

  const staticBuildIndex = commandIndex(workflowText, "npm run build:static");
  const releaseCheckIndex = commandIndex(workflowText, "npm run release:check");
  const siteCheckIndex = commandIndex(workflowText, "npm run site:check");
  const mockE2eIndex = commandIndex(workflowText, "npm run e2e:static:mock:run");
  const fileE2eIndex = commandIndex(workflowText, "npm run e2e:static:file:run");
  const desktopBuildIndex = commandIndex(workflowText, "npm run desktop:build");
  const uploadIndex = commandIndex(workflowText, "actions/upload-artifact@v4");
  const releasePublishIndex = commandIndex(workflowText, "softprops/action-gh-release@v2");
  const releaseScanIndices = commandIndices(workflowText, "npm run secret:scan:release");
  const releaseVersionInputIndices = commandIndices(workflowText, "RELEASE_VERSION: ${{ steps.release_metadata.outputs.version }}");
  const archiveBaseInputIndices = commandIndices(workflowText, "STATIC_ARCHIVE_BASE_REF: ${{ steps.release_metadata.outputs.base_sha }}");
  const checksumIndex = commandIndex(workflowText, "Get-FileHash");
  const finalStrictParityIndex = commandIndex(workflowText, "node scripts/release-archive-parity.mjs --strict", true);
  const firstReleaseScan = releaseScanIndices[0] ?? -1;
  const finalReleaseScan = releaseScanIndices.at(-1) ?? -1;
  if (releaseVersionInputIndices.length < 2) {
    errors.push("Release workflow must pass the resolved release version into both strict parity gates.");
  }
  if (archiveBaseInputIndices.length < 2) {
    errors.push("Release workflow must pass the explicit prior commit into both strict parity gates.");
  }
  if (staticBuildIndex >= 0 && desktopBuildIndex >= 0) {
    if (firstReleaseScan < staticBuildIndex || firstReleaseScan > desktopBuildIndex) {
      errors.push("Release workflow must scan frontend release artifacts before desktop packaging.");
    }
    if (releaseScanIndices.length < 2 || finalReleaseScan < desktopBuildIndex || (checksumIndex >= 0 && finalReleaseScan > checksumIndex)) {
      errors.push("Release workflow must scan final desktop release artifacts before checksums and upload.");
    }
  }

  const staticGateIndices = [staticBuildIndex, siteCheckIndex, mockE2eIndex, fileE2eIndex];
  if (staticGateIndices.every((index) => index >= 0)) {
    if (!(staticBuildIndex < siteCheckIndex && siteCheckIndex < mockE2eIndex && mockE2eIndex < fileE2eIndex)) {
      errors.push("Release workflow must run static build, site check, mock E2E, and file-mode E2E in order.");
    }
    if (uploadIndex >= 0 && staticGateIndices.some((index) => index > uploadIndex)) {
      errors.push("Release workflow must finish all static release gates before upload.");
    }
  }

  if (staticBuildIndex >= 0 && releaseCheckIndex >= 0 && releaseCheckIndex < staticBuildIndex) {
    errors.push("Release workflow must build static release bytes before running release readiness.");
  }

  if (
    desktopBuildIndex < 0
    || finalStrictParityIndex < 0
    || checksumIndex < 0
    || uploadIndex < 0
    || releasePublishIndex < 0
    || !(desktopBuildIndex < finalStrictParityIndex
      && finalStrictParityIndex < checksumIndex
      && checksumIndex < uploadIndex
      && uploadIndex < releasePublishIndex)
  ) {
    errors.push("Release workflow must run final strict parity after desktop packaging and before checksums.");
  } else {
    const guardedReleaseRegion = workflowText.slice(
      finalStrictParityIndex + "node scripts/release-archive-parity.mjs --strict".length,
      releasePublishIndex,
    );
    const interveningRunCommands = guardedReleaseRegion.match(/^\s*run:\s*/gm) ?? [];
    if (interveningRunCommands.length !== 1) {
      errors.push("Release workflow must not run modifying commands between final strict parity, checksums, and upload.");
    }
  }

  const checkoutIndex = commandIndex(workflowText, "actions/checkout@v4");
  const headVerificationIndex = commandIndex(workflowText, "git rev-parse HEAD");
  const installIndex = commandIndex(workflowText, "npm ci");
  if (checkoutIndex >= 0 && headVerificationIndex >= 0 && installIndex >= 0
    && (headVerificationIndex < checkoutIndex || headVerificationIndex > installIndex)) {
    errors.push("Release workflow must verify the validated tag commit before installing or building.");
  }

  return errors;
}

export function checkPagesWorkflow(workflowText) {
  const checks = [
    [/push:\s*[\s\S]*branches:\s*[\s\S]*main/, "Pages workflow must deploy from main pushes."],
    [/workflow_dispatch:/, "Pages workflow must support manual dispatch."],
    [/permissions:\s*[\s\S]*contents:\s*read/, "Pages workflow must grant contents: read."],
    [/permissions:\s*[\s\S]*pages:\s*write/, "Pages workflow must grant pages: write."],
    [/permissions:\s*[\s\S]*id-token:\s*write/, "Pages workflow must grant id-token: write."],
    [/actions\/checkout@v4/, "Pages workflow must check out the repository."],
    [/actions\/setup-node@v4/, "Pages workflow must install Node.js."],
    [/npm ci/, "Pages workflow must install dependencies with npm ci."],
    [/npm run secret:scan/, "Pages workflow must run the unified secret scan."],
    [/npm run pages:check/, "Pages workflow must run the non-strict Pages readiness check."],
    [/npm run test:run/, "Pages workflow must run frontend tests."],
    [/npm run build:static/, "Pages workflow must build the static HTML site."],
    [/npm run site:check/, "Pages workflow must check static site output."],
    [/actions\/upload-pages-artifact@v3/, "Pages workflow must upload a Pages artifact."],
    [/path:\s*dist-static/, "Pages workflow must publish dist-static."],
    [/actions\/deploy-pages@v4/, "Pages workflow must deploy with actions/deploy-pages."],
  ];

  const errors = checks
    .filter(([pattern]) => !pattern.test(workflowText))
    .map(([, message]) => message);

  const staticBuildIndex = commandIndex(workflowText, "npm run build:static");
  const pagesCheckIndex = commandIndex(workflowText, "npm run pages:check");
  const siteCheckIndex = commandIndex(workflowText, "npm run site:check");
  const secretScanIndex = commandIndex(workflowText, "npm run secret:scan", true);
  const uploadIndex = commandIndex(workflowText, "actions/upload-pages-artifact@v3");
  if (
    staticBuildIndex >= 0
    && siteCheckIndex >= 0
    && secretScanIndex >= 0
    && uploadIndex >= 0
    && (secretScanIndex < Math.max(staticBuildIndex, siteCheckIndex) || secretScanIndex > uploadIndex)
  ) {
    errors.push("Pages workflow must scan built static artifacts before upload.");
  }

  if (/npm run release:check|release-archive-parity\.mjs --strict/.test(workflowText)) {
    errors.push("Pages workflow must not run strict release readiness.");
  }

  if (staticBuildIndex >= 0 && pagesCheckIndex >= 0 && pagesCheckIndex < staticBuildIndex) {
    errors.push("Pages workflow must build static release bytes before running Pages readiness.");
  }

  return errors;
}

export function checkCiWorkflow(workflowText) {
  const checks = [
    [/fetch-depth:\s*0/, "CI checkout must fetch full history for archive immutability."],
    [/git merge-base HEAD origin\/main/, "PR CI must derive the archive base from merge-base/origin/main."],
    [/github\.event\.before/, "Push CI must use the explicit prior event SHA as the archive base."],
    [/STATIC_ARCHIVE_BASE_REF=\$baseSha/, "CI must export the resolved archive base for strict release checks."],
    [/npm run release:check/, "CI must run strict release readiness."],
  ];
  return checks.filter(([pattern]) => !pattern.test(workflowText)).map(([, message]) => message);
}

export function checkTauriWindowsBundleConfig(config) {
  const errors = [];
  const bundle = config?.bundle;

  if (!hasBundleTarget(bundle?.targets, "nsis")) {
    errors.push("Tauri bundle targets must include nsis so GitHub Release gets a setup.exe.");
  }

  if (bundle?.windows?.webviewInstallMode?.type !== "offlineInstaller") {
    errors.push("Tauri Windows WebView2 install mode must be offlineInstaller.");
  }

  return errors;
}

function cargoTomlPackageVersion(cargoToml) {
  const packageHeader = "[package]";
  const packageStart = cargoToml?.indexOf(packageHeader) ?? -1;
  if (packageStart < 0) {
    return undefined;
  }

  const afterHeader = cargoToml.slice(packageStart + packageHeader.length);
  const nextSection = afterHeader.search(/^\[/m);
  const packageSection = nextSection >= 0 ? afterHeader.slice(0, nextSection) : afterHeader;
  return packageSection?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
}

function cargoLockPackageVersion(cargoLock, packageName) {
  const packageBlocks = cargoLock?.split(/^\[\[package\]\]\s*$/m).slice(1) ?? [];
  const packageBlock = packageBlocks.find((block) => block.match(/^name\s*=\s*"([^"]+)"\s*$/m)?.[1] === packageName);
  return packageBlock?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
}

export function checkPackageReleaseMetadata(packageJson, packageLock, tauriConfig, cargoToml, cargoLock) {
  const errors = [];

  if (packageJson?.license !== "MIT") {
    errors.push("package.json license must be MIT.");
  }

  if (packageJson?.scripts?.["secret:scan:release"] !== "node scripts/secret-scan.mjs --release-artifacts") {
    errors.push("package.json must expose the release artifact secret scan script.");
  }

  if (!packageJson?.scripts?.["release:check"]?.includes("node scripts/release-archive-parity.mjs --strict")) {
    errors.push("package.json release:check must run strict archive parity.");
  }

  if (!packageJson?.scripts?.["release:check"]?.includes("node scripts/clean-static-repro-check.mjs")) {
    errors.push("package.json release:check must verify a clean HEAD static build.");
  }

  if (packageJson?.scripts?.["pages:check"] !== "node scripts/release-readiness.mjs") {
    errors.push("package.json must expose a non-strict pages:check readiness command.");
  }

  if (packageLock?.version !== packageJson?.version || packageLock?.packages?.[""]?.version !== packageJson?.version) {
    errors.push("package-lock.json root version must match package.json.");
  }

  if (packageLock?.packages?.[""]?.license !== "MIT") {
    errors.push("package-lock.json root license must be MIT.");
  }

  if (tauriConfig?.version !== packageJson?.version) {
    errors.push("src-tauri/tauri.conf.json version must match package.json.");
  }

  if (cargoTomlPackageVersion(cargoToml) !== packageJson?.version) {
    errors.push("src-tauri/Cargo.toml package version must match package.json.");
  }

  if (cargoLockPackageVersion(cargoLock, packageJson?.name) !== packageJson?.version) {
    errors.push("src-tauri/Cargo.lock package version must match package.json.");
  }

  return errors;
}

function checkPublicProjectDocs(rootDir, releaseVersion) {
  const requiredFiles = [
    "README.md",
    "README.en.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    join("docs", "faq.md"),
    join("docs", "release.md"),
    join("docs", "release.en.md"),
    join("docs", "release-checklist.md"),
    join("docs", "static-site-hosting.zh-CN.md"),
    join("docs", "static-site-hosting.en-US.md"),
    join("docs", "release-notes", `v${releaseVersion}.md`),
    join("docs", "assets", "app-preview.svg"),
    join(".github", "ISSUE_TEMPLATE", "bug_report.yml"),
    join(".github", "ISSUE_TEMPLATE", "feature_request.yml"),
  ];

  const missingErrors = requiredFiles
    .filter((file) => !existsSync(join(rootDir, file)))
    .map((file) => `${file} is missing.`);

  const releaseDocPaths = [
    join("docs", "release-checklist.md"),
    join("docs", "release.md"),
    join("docs", "release.en.md"),
  ];
  const releaseDocs = Object.fromEntries(
    releaseDocPaths
      .filter((file) => existsSync(join(rootDir, file)))
      .map((file) => [file, readText(join(rootDir, file))]),
  );

  return [...missingErrors, ...checkManualReleaseDocumentation(releaseDocs)];
}

export function checkManualReleaseDocumentation(documents) {
  const checks = [
    {
      file: join("docs", "release-checklist.md"),
      patterns: [
        /workflow_dispatch/,
        /匹配的 tag 必须在远程仓库中已存在/,
        /只用于重跑或受控调度/,
        /不会创建缺失的标签/,
      ],
    },
    {
      file: join("docs", "release.md"),
      patterns: [
        /workflow_dispatch/,
        /匹配的 tag 必须在远程仓库中已存在/,
        /只用于重跑或受控调度/,
        /不会创建缺失的标签/,
      ],
    },
    {
      file: join("docs", "release.en.md"),
      patterns: [
        /workflow_dispatch/,
        /matching tag must already exist remotely/i,
        /only a rerun or controlled dispatch path/i,
        /does not create a missing tag/i,
      ],
    },
  ];

  return checks
    .filter(({ file, patterns }) => {
      const contents = documents[file];
      return typeof contents === "string" && patterns.some((pattern) => !pattern.test(contents));
    })
    .map(({ file }) => `${file} must state that workflow_dispatch only reruns an existing remote tag.`);
}

export function runReleaseReadiness(rootDir) {
  const errors = [];
  const releaseWorkflowPath = join(rootDir, ".github", "workflows", "release.yml");
  const ciWorkflowPath = join(rootDir, ".github", "workflows", "ci.yml");
  const pagesWorkflowPath = join(rootDir, ".github", "workflows", "pages.yml");
  const tauriConfigPath = join(rootDir, "src-tauri", "tauri.conf.json");
  const cargoTomlPath = join(rootDir, "src-tauri", "Cargo.toml");
  const cargoLockPath = join(rootDir, "src-tauri", "Cargo.lock");
  const packageJsonPath = join(rootDir, "package.json");
  const packageLockPath = join(rootDir, "package-lock.json");
  const packageJson = readJson(packageJsonPath);
  const releaseVersion = packageJson.version;

  if (!existsSync(packageLockPath)) {
    errors.push("package-lock.json is missing.");
  }

  if (!existsSync(releaseWorkflowPath)) {
    errors.push(".github/workflows/release.yml is missing.");
  } else {
    errors.push(...checkReleaseWorkflow(readText(releaseWorkflowPath)));
  }

  if (!existsSync(ciWorkflowPath)) {
    errors.push(".github/workflows/ci.yml is missing.");
  } else {
    errors.push(...checkCiWorkflow(readText(ciWorkflowPath)));
  }

  if (!existsSync(pagesWorkflowPath)) {
    errors.push(".github/workflows/pages.yml is missing.");
  } else {
    errors.push(...checkPagesWorkflow(readText(pagesWorkflowPath)));
  }

  if (!existsSync(tauriConfigPath)) {
    errors.push("src-tauri/tauri.conf.json is missing.");
  } else {
    errors.push(...checkTauriWindowsBundleConfig(readJson(tauriConfigPath)));
  }

  if (!existsSync(cargoTomlPath)) {
    errors.push("src-tauri/Cargo.toml is missing.");
  }

  if (!existsSync(cargoLockPath)) {
    errors.push("src-tauri/Cargo.lock is missing.");
  }

  if (existsSync(packageLockPath) && existsSync(tauriConfigPath) && existsSync(cargoTomlPath) && existsSync(cargoLockPath)) {
    errors.push(
      ...checkPackageReleaseMetadata(
        packageJson,
        readJson(packageLockPath),
        readJson(tauriConfigPath),
        readText(cargoTomlPath),
        readText(cargoLockPath),
      ),
    );
  }

  errors.push(...checkPublicProjectDocs(rootDir, releaseVersion));
  errors.push(...scanRepositorySecrets(rootDir).map(formatSecretFinding));

  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = runReleaseReadiness(process.cwd());

  if (errors.length > 0) {
    console.error("Release readiness check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Release readiness check passed.");
}
