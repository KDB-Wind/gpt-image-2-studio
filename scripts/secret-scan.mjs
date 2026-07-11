import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXCLUDED_PREFIXES = [
  ".git/",
  "coverage/",
  "node_modules/",
  "playwright-report/",
  "src-tauri/target/",
  "test-results/",
];
const EXCLUDED_FILES = new Set([".env.e2e.local"]);
const MAX_TEXT_FILE_BYTES = 12 * 1024 * 1024;
const MAX_RELEASE_ARTIFACT_BYTES = 256 * 1024 * 1024;
const SENSITIVE_ASSIGNMENT_NAME =
  "(?:api[_-]?key|apikey|access[_-]?token|client[_-]?secret|private[_-]?key|refresh[_-]?token|aws[_-]?secret[_-]?access[_-]?key|aws[_-]?access[_-]?key[_-]?id|github[_-]?token|secret|token)";

const RULES = [
  {
    name: "openai-like-key",
    pattern: /\bsk-(?:live[_-])?[A-Za-z0-9_-]{20,}\b/g,
    value: (match) => match[0],
  },
  {
    name: "step-like-key",
    pattern: /\b1ts[A-Za-z0-9_-]{20,}\b/g,
    value: (match) => match[0],
  },
  {
    name: "known-service-token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{28,}|(?:AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|ya29\.[A-Za-z0-9_-]{20,})\b/g,
    value: (match) => match[0],
  },
  {
    name: "bearer-token",
    pattern: /\bAuthorization\s*:\s*Bearer\s+([A-Za-z0-9._~+/=-]{20,})/gi,
    value: (match) => match[1],
  },
  {
    name: "signed-url-secret",
    pattern: /[?&](?:access_token|api_key|key|signature|token|x-amz-signature)=([A-Za-z0-9._~+/=-]{16,})/gi,
    value: (match) => match[1],
  },
  {
    name: "sensitive-assignment",
    pattern: new RegExp(
      `\\b${SENSITIVE_ASSIGNMENT_NAME}\\b\\s*[:=]\\s*["']?([A-Za-z0-9._~+/=-]{20,})`,
      "gi",
    ),
    value: (match) => match[1],
    requireEntropy: true,
  },
];

export function findSecretFindings(filesByPath, configuredSecrets = []) {
  const findings = [];
  const seen = new Set();

  for (const [path, contents] of Object.entries(filesByPath)) {
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of contents.matchAll(rule.pattern)) {
        const value = rule.value(match);
        if (!value || (rule.requireEntropy && !looksHighEntropy(value))) {
          continue;
        }
        addFinding(findings, seen, path, rule.name);
      }
    }

    for (const configuredSecret of configuredSecrets) {
      if (configuredSecret && contents.includes(configuredSecret)) {
        addFinding(findings, seen, path, "configured-e2e-secret");
      }
    }
  }

  return findings.sort((left, right) =>
    left.path.localeCompare(right.path) || left.rule.localeCompare(right.rule),
  );
}

export function scanRepositorySecrets(rootDir = process.cwd()) {
  const normalizedRoot = resolve(rootDir);
  const filesByPath = readCandidateFiles(normalizedRoot);
  const configuredSecrets = readConfiguredE2eSecrets(normalizedRoot);
  return findSecretFindings(filesByPath, configuredSecrets);
}

export function scanReleaseArtifactSecrets(rootDir = process.cwd()) {
  const normalizedRoot = resolve(rootDir);
  const paths = new Set();
  collectDirectoryFiles(normalizedRoot, join(normalizedRoot, "dist"), paths);
  collectDirectoryFiles(normalizedRoot, join(normalizedRoot, "dist-static"), paths);
  collectTopLevelFiles(normalizedRoot, join(normalizedRoot, "src-tauri", "target", "release"), paths);
  collectDirectoryFiles(normalizedRoot, join(normalizedRoot, "src-tauri", "target", "release", "bundle"), paths);

  const filesByPath = {};
  for (const path of paths) {
    const contents = readReleaseArtifact(join(normalizedRoot, path));
    if (contents !== null) {
      filesByPath[normalizePath(path)] = contents;
    }
  }

  return findSecretFindings(filesByPath, readConfiguredE2eSecrets(normalizedRoot));
}

export function formatSecretFinding(finding) {
  return `${finding.path}: ${finding.rule}`;
}

function addFinding(findings, seen, path, rule) {
  const key = `${path}\0${rule}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  findings.push({ path, rule });
}

function readCandidateFiles(rootDir) {
  const paths = new Set(listGitCandidateFiles(rootDir));
  collectDirectoryFiles(rootDir, join(rootDir, "dist-static"), paths);
  const filesByPath = {};

  for (const path of paths) {
    const normalizedPath = normalizePath(path);
    if (!isCandidatePath(normalizedPath)) {
      continue;
    }

    const absolutePath = join(rootDir, normalizedPath);
    const contents = readTextFile(absolutePath);
    if (contents !== null) {
      filesByPath[normalizedPath] = contents;
    }
  }

  return filesByPath;
}

function listGitCandidateFiles(rootDir) {
  try {
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: rootDir,
      encoding: "utf8",
      windowsHide: true,
    })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function collectDirectoryFiles(rootDir, directory, paths) {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectDirectoryFiles(rootDir, absolutePath, paths);
    } else if (entry.isFile()) {
      paths.add(normalizePath(relative(rootDir, absolutePath)));
    }
  }
}

function collectTopLevelFiles(rootDir, directory, paths) {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile()) {
      paths.add(normalizePath(relative(rootDir, join(directory, entry.name))));
    }
  }
}

function isCandidatePath(path) {
  const lowerPath = path.toLowerCase();
  if (EXCLUDED_FILES.has(lowerPath)) {
    return false;
  }
  if (EXCLUDED_PREFIXES.some((prefix) => lowerPath.startsWith(prefix))) {
    return false;
  }
  return true;
}

function readTextFile(path) {
  try {
    const stats = statSync(path);
    if (!stats.isFile() || stats.size > MAX_TEXT_FILE_BYTES) {
      return null;
    }
    const buffer = readFileSync(path);
    if (buffer.includes(0)) {
      return null;
    }
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

function readReleaseArtifact(path) {
  try {
    const stats = statSync(path);
    if (!stats.isFile() || stats.size > MAX_RELEASE_ARTIFACT_BYTES) {
      return null;
    }

    const buffer = readFileSync(path);
    const swapped = Buffer.allocUnsafe(buffer.length - (buffer.length % 2));
    for (let index = 0; index < swapped.length; index += 2) {
      swapped[index] = buffer[index + 1];
      swapped[index + 1] = buffer[index];
    }

    return [buffer.toString("latin1"), buffer.toString("utf16le"), swapped.toString("utf16le")].join("\n");
  } catch {
    return null;
  }
}

function readConfiguredE2eSecrets(rootDir) {
  const envPath = join(rootDir, ".env.e2e.local");
  const contents = readTextFile(envPath);
  if (contents === null) {
    return [];
  }

  const secrets = [];
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !/(?:API[_-]?KEY|PASSWORD|SECRET|TOKEN)/i.test(match[1])) {
      continue;
    }
    const value = stripQuotes(match[2]);
    if (value.length >= 12) {
      secrets.push(value);
    }
  }
  return [...new Set(secrets)];
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function looksHighEntropy(value) {
  const uniqueCharacters = new Set(value).size;
  const categories = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[._~+/=-]/.test(value)].filter(Boolean)
    .length;
  return uniqueCharacters >= 12 && categories >= 3;
}

function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const releaseArtifactsOnly = process.argv.includes("--release-artifacts");
  const findings = releaseArtifactsOnly
    ? scanReleaseArtifactSecrets(process.cwd())
    : scanRepositorySecrets(process.cwd());
  if (findings.length > 0) {
    console.error("Secret scan failed:");
    for (const finding of findings) {
      console.error(`- ${formatSecretFinding(finding)}`);
    }
    process.exit(1);
  }
  console.log(releaseArtifactsOnly ? "Release artifact secret scan passed." : "Secret scan passed.");
}
