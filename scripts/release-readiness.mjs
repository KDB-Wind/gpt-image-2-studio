import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".rs",
  ".toml",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml",
]);

const SECRET_PATTERNS = [
  {
    label: "a real-looking API key pattern",
    pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/,
  },
];

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

function listCandidateFiles(rootDir) {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()));
}

function readCandidateFiles(rootDir) {
  return Object.fromEntries(
    listCandidateFiles(rootDir).map((file) => [file, readText(join(rootDir, file))]),
  );
}

export function findSensitivePatterns(filesByPath) {
  const findings = [];

  for (const [file, contents] of Object.entries(filesByPath)) {
    for (const secretPattern of SECRET_PATTERNS) {
      if (secretPattern.pattern.test(contents)) {
        findings.push(`${file} contains ${secretPattern.label}.`);
      }
    }
  }

  return findings;
}

export function checkReleaseWorkflow(workflowText) {
  const checks = [
    [/v\*\.\*\.\*/, "Release workflow must trigger on v*.*.* tags."],
    [/workflow_dispatch:/, "Release workflow must support manual dispatch."],
    [/permissions:\s*[\s\S]*contents:\s*write/, "Release workflow must grant contents: write."],
    [/runs-on:\s*windows-latest/, "Release workflow must build on windows-latest."],
    [/actions\/checkout@v4/, "Release workflow must check out the repository."],
    [/actions\/setup-node@v4/, "Release workflow must install Node.js."],
    [/dtolnay\/rust-toolchain@stable/, "Release workflow must install Rust stable."],
    [/npm ci/, "Release workflow must install dependencies with npm ci."],
    [/npm run release:check/, "Release workflow must run the release readiness check."],
    [/npm run test:run/, "Release workflow must run tests before packaging."],
    [/npm run build/, "Release workflow must build the frontend before packaging."],
    [/npm run desktop:build/, "Release workflow must build Tauri desktop bundles."],
    [/actions\/upload-artifact@v4/, "Release workflow must upload installer artifacts."],
    [/softprops\/action-gh-release@v2/, "Release workflow must create or update a GitHub Release."],
  ];

  return checks
    .filter(([pattern]) => !pattern.test(workflowText))
    .map(([, message]) => message);
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

export function runReleaseReadiness(rootDir) {
  const errors = [];
  const releaseWorkflowPath = join(rootDir, ".github", "workflows", "release.yml");
  const ciWorkflowPath = join(rootDir, ".github", "workflows", "ci.yml");
  const tauriConfigPath = join(rootDir, "src-tauri", "tauri.conf.json");

  if (!existsSync(releaseWorkflowPath)) {
    errors.push(".github/workflows/release.yml is missing.");
  } else {
    errors.push(...checkReleaseWorkflow(readText(releaseWorkflowPath)));
  }

  if (!existsSync(ciWorkflowPath)) {
    errors.push(".github/workflows/ci.yml is missing.");
  }

  if (!existsSync(tauriConfigPath)) {
    errors.push("src-tauri/tauri.conf.json is missing.");
  } else {
    errors.push(...checkTauriWindowsBundleConfig(readJson(tauriConfigPath)));
  }

  errors.push(...findSensitivePatterns(readCandidateFiles(rootDir)));

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
