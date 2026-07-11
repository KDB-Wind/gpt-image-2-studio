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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function commandIndex(workflowText, command, useLast = false) {
  return useLast ? workflowText.lastIndexOf(command) : workflowText.indexOf(command);
}

export function checkReleaseWorkflow(workflowText, releaseVersion) {
  const releaseNotesPathPattern = new RegExp(
    `body_path:\\s*docs\\/release-notes\\/v${escapeRegExp(releaseVersion)}\\.md`,
  );

  const checks = [
    [/v\*\.\*\.\*/, "Release workflow must trigger on v*.*.* tags."],
    [/workflow_dispatch:/, "Release workflow must support manual dispatch."],
    [/permissions:\s*[\s\S]*contents:\s*write/, "Release workflow must grant contents: write."],
    [/runs-on:\s*windows-latest/, "Release workflow must build on windows-latest."],
    [/actions\/checkout@v4/, "Release workflow must check out the repository."],
    [/actions\/setup-node@v4/, "Release workflow must install Node.js."],
    [/dtolnay\/rust-toolchain@stable/, "Release workflow must install Rust stable."],
    [/npm ci/, "Release workflow must install dependencies with npm ci."],
    [/npm run secret:scan/, "Release workflow must run the unified secret scan."],
    [/npm run release:check/, "Release workflow must run the release readiness check."],
    [/npm run test:run/, "Release workflow must run tests before packaging."],
    [/npm run build/, "Release workflow must build the frontend before packaging."],
    [/npm run build:static/, "Release workflow must build the single-file HTML release asset."],
    [/npm run desktop:build/, "Release workflow must build Tauri desktop bundles."],
    [/Get-FileHash[\s\S]*SHA256SUMS\.txt/, "Release workflow must generate SHA256SUMS.txt for Windows installer assets."],
    [/actions\/upload-artifact@v4/, "Release workflow must upload installer artifacts."],
    [/actions\/upload-artifact@v4[\s\S]*path:\s*\|[\s\S]*dist-static\/gpt-image-2-studio-lite\.html/, "Release workflow must upload the single-file HTML release asset."],
    [/actions\/upload-artifact@v4[\s\S]*path:\s*\|[\s\S]*SHA256SUMS\.txt/, "Release workflow must upload SHA256SUMS.txt as a workflow artifact."],
    [/actions\/upload-artifact@v4[\s\S]*retention-days:\s*\d+/, "Release workflow must set artifact retention-days for installer artifacts."],
    [/softprops\/action-gh-release@v2/, "Release workflow must create or update a GitHub Release."],
    [releaseNotesPathPattern, `Release workflow must use the v${releaseVersion} release notes body.`],
    [/softprops\/action-gh-release@v2[\s\S]*files:\s*\|[\s\S]*dist-static\/gpt-image-2-studio-lite\.html/, "Release workflow must attach the single-file HTML asset to the draft GitHub Release."],
    [/softprops\/action-gh-release@v2[\s\S]*files:\s*\|[\s\S]*SHA256SUMS\.txt/, "Release workflow must attach SHA256SUMS.txt to the draft GitHub Release."],
  ];

  const errors = checks
    .filter(([pattern]) => !pattern.test(workflowText))
    .map(([, message]) => message);

  const staticBuildIndex = commandIndex(workflowText, "npm run build:static");
  const desktopBuildIndex = commandIndex(workflowText, "npm run desktop:build");
  const secretScanIndex = commandIndex(workflowText, "npm run secret:scan", true);
  const checksumIndex = commandIndex(workflowText, "Get-FileHash");
  if (
    staticBuildIndex >= 0
    && desktopBuildIndex >= 0
    && secretScanIndex >= 0
    && (secretScanIndex < Math.max(staticBuildIndex, desktopBuildIndex)
      || (checksumIndex >= 0 && secretScanIndex > checksumIndex))
  ) {
    errors.push("Release workflow must scan built release assets before checksums and upload.");
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
    [/npm run release:check/, "Pages workflow must run the release readiness check."],
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

  return errors;
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

  return requiredFiles
    .filter((file) => !existsSync(join(rootDir, file)))
    .map((file) => `${file} is missing.`);
}

export function runReleaseReadiness(rootDir) {
  const errors = [];
  const releaseWorkflowPath = join(rootDir, ".github", "workflows", "release.yml");
  const ciWorkflowPath = join(rootDir, ".github", "workflows", "ci.yml");
  const pagesWorkflowPath = join(rootDir, ".github", "workflows", "pages.yml");
  const tauriConfigPath = join(rootDir, "src-tauri", "tauri.conf.json");
  const packageJsonPath = join(rootDir, "package.json");
  const releaseVersion = readJson(packageJsonPath).version;

  if (!existsSync(releaseWorkflowPath)) {
    errors.push(".github/workflows/release.yml is missing.");
  } else {
    errors.push(...checkReleaseWorkflow(readText(releaseWorkflowPath), releaseVersion));
  }

  if (!existsSync(ciWorkflowPath)) {
    errors.push(".github/workflows/ci.yml is missing.");
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
