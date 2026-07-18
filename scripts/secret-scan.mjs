import { execFileSync } from "node:child_process";
import * as nodeFs from "node:fs";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXCLUDED_PREFIXES = [
  ".git/",
  "coverage/",
  "node_modules/",
  "src-tauri/target/",
];
const TRACKED_SENSITIVE_PREFIXES = ["playwright-report/", "test-results/"];
const TRACKED_SENSITIVE_FILES = new Set([".env.e2e.local"]);
const MAX_TEXT_FILE_BYTES = 12 * 1024 * 1024;
const GIT_BATCH_TARGET_BYTES = 24 * 1024 * 1024;
const RELEASE_SCAN_CHUNK_BYTES = 1024 * 1024;
const RELEASE_SCAN_MIN_OVERLAP_BYTES = 64 * 1024;
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
      `\\b${SENSITIVE_ASSIGNMENT_NAME}\\b\\s*[:=]\\s*(?:["']([A-Za-z0-9._~+/=-]{20,})["']|([A-Za-z0-9._~+/-]{20,}={0,2}))`,
      "gi",
    ),
    value: (match) => match[1] ?? match[2],
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
  const configuredSecrets = readConfiguredE2eSecrets(normalizedRoot);
  const findings = [];
  const seen = new Set();

  try {
    assertGitRepository(normalizedRoot);
    const indexEntries = listGitIndexEntries(normalizedRoot);
    const worktreePaths = new Set(indexEntries.map((entry) => entry.path));
    for (const path of listGitUntrackedFiles(normalizedRoot)) {
      worktreePaths.add(path);
    }
    collectDirectoryFiles(normalizedRoot, join(normalizedRoot, "dist-static"), worktreePaths);

    const indexContentsByObject = readGitIndexTexts(normalizedRoot, indexEntries);
    for (const entry of indexEntries) {
      const normalizedPath = normalizePath(entry.path);
      if (isTrackedSensitivePath(normalizedPath)) {
        addFinding(findings, seen, normalizedPath, "tracked-sensitive-path");
      }
      if (!isCandidatePath(normalizedPath)) {
        continue;
      }

      const contents = indexContentsByObject.get(entry.objectId) ?? null;
      addSecretFindings(findings, seen, normalizedPath, contents, configuredSecrets);
    }

    for (const path of worktreePaths) {
      const normalizedPath = normalizePath(path);
      if (!isCandidatePath(normalizedPath)) {
        continue;
      }
      const contents = readTextFile(join(normalizedRoot, normalizedPath));
      addSecretFindings(findings, seen, normalizedPath, contents, configuredSecrets);
    }
  } catch {
    addFinding(findings, seen, ".", "repository-scan-error");
  }

  return findings.sort((left, right) =>
    left.path.localeCompare(right.path) || left.rule.localeCompare(right.rule),
  );
}

export function scanReleaseArtifactSecrets(rootDir = process.cwd(), { fs: fsOverrides = {} } = {}) {
  const normalizedRoot = resolve(rootDir);
  const fs = { ...nodeFs, ...fsOverrides };
  const paths = new Set();
  const findings = [];
  const seen = new Set();
  const configuredSecrets = readConfiguredE2eSecrets(normalizedRoot);
  collectReleaseDirectoryFiles(fs, normalizedRoot, join(normalizedRoot, "dist"), paths, findings, seen);
  collectReleaseDirectoryFiles(fs, normalizedRoot, join(normalizedRoot, "dist-static"), paths, findings, seen);
  collectReleaseDirectoryFiles(
    fs,
    normalizedRoot,
    join(normalizedRoot, "src-tauri", "target", "release"),
    paths,
    findings,
    seen,
    { topLevelOnly: true },
  );
  collectReleaseDirectoryFiles(
    fs,
    normalizedRoot,
    join(normalizedRoot, "src-tauri", "target", "release", "bundle"),
    paths,
    findings,
    seen,
  );

  for (const path of paths) {
    scanReleaseArtifactFile({
      fs,
      absolutePath: join(normalizedRoot, path),
      displayPath: normalizePath(path),
      configuredSecrets,
      findings,
      seen,
    });
  }

  return findings.sort((left, right) =>
    left.path.localeCompare(right.path) || left.rule.localeCompare(right.rule),
  );
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

function addSecretFindings(findings, seen, path, contents, configuredSecrets) {
  if (contents === null) {
    return;
  }
  for (const finding of findSecretFindings({ [path]: contents }, configuredSecrets)) {
    addFinding(findings, seen, finding.path, finding.rule);
  }
}

function runGit(rootDir, args, { input, maxBuffer = 64 * 1024 * 1024 } = {}) {
  return execFileSync("git", args, {
    cwd: rootDir,
    input,
    windowsHide: true,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
    maxBuffer,
  });
}

function splitNulDelimited(buffer) {
  return buffer
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function assertGitRepository(rootDir) {
  const topLevel = runGit(rootDir, ["rev-parse", "--show-toplevel"], { maxBuffer: 4096 })
    .toString("utf8")
    .trim();
  if (resolve(topLevel).toLowerCase() !== resolve(rootDir).toLowerCase()) {
    throw new Error("Secret scan root is not the Git worktree root.");
  }
}

function listGitIndexEntries(rootDir) {
  return splitNulDelimited(runGit(rootDir, ["ls-files", "--cached", "--stage", "-z"])).map(
    (record) => {
      const separator = record.indexOf("\t");
      const metadata = separator >= 0 ? record.slice(0, separator).split(" ") : [];
      if (separator < 0 || metadata.length !== 3 || !/^[0-9a-f]+$/i.test(metadata[1])) {
        throw new Error("Invalid Git index entry.");
      }
      return {
        mode: metadata[0],
        objectId: metadata[1],
        stage: metadata[2],
        path: record.slice(separator + 1),
      };
    },
  );
}

function listGitUntrackedFiles(rootDir) {
  return splitNulDelimited(
    runGit(rootDir, ["ls-files", "--others", "--exclude-standard", "-z"]),
  );
}

function readGitIndexTexts(rootDir, entries) {
  const objectIds = [
    ...new Set(entries.filter((entry) => entry.mode !== "160000").map((entry) => entry.objectId)),
  ];
  const contentsByObject = new Map();
  if (objectIds.length === 0) {
    return contentsByObject;
  }

  const metadataOutput = runGit(
    rootDir,
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    {
      input: `${objectIds.join("\n")}\n`,
      maxBuffer: Math.max(1024 * 1024, objectIds.length * 128),
    },
  ).toString("ascii");
  const metadataLines = metadataOutput.trimEnd().split(/\r?\n/);
  if (metadataLines.length !== objectIds.length) {
    throw new Error("Git index metadata response was incomplete.");
  }

  const readableObjects = [];
  for (let index = 0; index < objectIds.length; index += 1) {
    const match = metadataLines[index].match(/^([0-9a-f]+) blob ([0-9]+)$/i);
    if (!match || match[1].toLowerCase() !== objectIds[index].toLowerCase()) {
      throw new Error("Git index metadata response was invalid.");
    }
    const size = Number.parseInt(match[2], 10);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("Invalid Git object size.");
    }
    if (size > MAX_TEXT_FILE_BYTES) {
      contentsByObject.set(objectIds[index], null);
    } else {
      readableObjects.push({ objectId: objectIds[index], size });
    }
  }

  for (const batch of groupGitObjects(readableObjects)) {
    const expectedBytes = batch.reduce((total, object) => total + object.size + 128, 0);
    const output = runGit(rootDir, ["cat-file", "--batch"], {
      input: `${batch.map((object) => object.objectId).join("\n")}\n`,
      maxBuffer: Math.max(1024 * 1024, expectedBytes),
    });
    parseGitBatchOutput(output, batch, contentsByObject);
  }

  return contentsByObject;
}

function groupGitObjects(objects) {
  const batches = [];
  let current = [];
  let currentBytes = 0;
  for (const object of objects) {
    if (current.length > 0 && currentBytes + object.size > GIT_BATCH_TARGET_BYTES) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(object);
    currentBytes += object.size;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function parseGitBatchOutput(output, expectedObjects, contentsByObject) {
  let offset = 0;
  for (const object of expectedObjects) {
    const headerEnd = output.indexOf(10, offset);
    if (headerEnd < 0) {
      throw new Error("Git index blob header was incomplete.");
    }
    const header = output.subarray(offset, headerEnd).toString("ascii");
    const expectedHeader = `${object.objectId} blob ${object.size}`;
    if (header.toLowerCase() !== expectedHeader.toLowerCase()) {
      throw new Error("Git index blob header was invalid.");
    }
    const contentsStart = headerEnd + 1;
    const contentsEnd = contentsStart + object.size;
    if (contentsEnd >= output.length || output[contentsEnd] !== 10) {
      throw new Error("Git index blob could not be read completely.");
    }
    const buffer = output.subarray(contentsStart, contentsEnd);
    contentsByObject.set(object.objectId, buffer.includes(0) ? null : buffer.toString("utf8"));
    offset = contentsEnd + 1;
  }
  if (offset !== output.length) {
    throw new Error("Git index blob response contained unexpected data.");
  }
}

function isTrackedSensitivePath(path) {
  const lowerPath = path.toLowerCase();
  return (
    TRACKED_SENSITIVE_FILES.has(lowerPath) ||
    TRACKED_SENSITIVE_PREFIXES.some((prefix) => lowerPath.startsWith(prefix))
  );
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

function collectReleaseDirectoryFiles(
  fs,
  rootDir,
  directory,
  paths,
  findings,
  seen,
  { topLevelOnly = false } = {},
) {
  let directoryStats;
  try {
    directoryStats = fs.lstatSync(directory);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    addFinding(findings, seen, normalizePath(relative(rootDir, directory)), "artifact-scan-error");
    return;
  }
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    addFinding(findings, seen, normalizePath(relative(rootDir, directory)), "artifact-scan-error");
    return;
  }

  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    addFinding(findings, seen, normalizePath(relative(rootDir, directory)), "artifact-scan-error");
    return;
  }

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    const displayPath = normalizePath(relative(rootDir, absolutePath));
    if (entry.isFile()) {
      paths.add(displayPath);
    } else if (entry.isDirectory() && !topLevelOnly) {
      collectReleaseDirectoryFiles(fs, rootDir, absolutePath, paths, findings, seen);
    } else if (entry.isSymbolicLink()) {
      addFinding(findings, seen, displayPath, "artifact-scan-error");
    }
  }
}

function isCandidatePath(path) {
  const lowerPath = path.toLowerCase();
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

function releaseScanOverlapBytes(configuredSecrets) {
  const configuredOverlap = configuredSecrets.reduce(
    (maximum, secret) => Math.max(maximum, Buffer.byteLength(secret, "utf8") + 16, secret.length * 2 + 16),
    0,
  );
  const overlap = Math.max(RELEASE_SCAN_MIN_OVERLAP_BYTES, configuredOverlap);
  return overlap + (overlap % 2);
}

function decodeUtf16Be(buffer) {
  const evenLength = buffer.length - (buffer.length % 2);
  const swapped = Buffer.allocUnsafe(evenLength);
  for (let index = 0; index < evenLength; index += 2) {
    swapped[index] = buffer[index + 1];
    swapped[index + 1] = buffer[index];
  }
  return swapped.toString("utf16le");
}

function releaseArtifactDecodings(buffer) {
  const shifted = buffer.length > 1 ? buffer.subarray(1) : Buffer.alloc(0);
  return [
    buffer.toString("utf8"),
    buffer.toString("latin1"),
    buffer.toString("utf16le"),
    shifted.toString("utf16le"),
    decodeUtf16Be(buffer),
    decodeUtf16Be(shifted),
  ].join("\n");
}

function scanReleaseArtifactFile({ fs, absolutePath, displayPath, configuredSecrets, findings, seen }) {
  let descriptor;
  let scanFailed = false;

  try {
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      throw new Error("Expected release artifact is not a file.");
    }

    descriptor = fs.openSync(absolutePath, "r");
    const chunk = Buffer.allocUnsafe(RELEASE_SCAN_CHUNK_BYTES);
    const overlapBytes = releaseScanOverlapBytes(configuredSecrets);
    let carry = Buffer.alloc(0);
    let totalBytesRead = 0;

    while (true) {
      const bytesRead = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) {
        break;
      }

      totalBytesRead += bytesRead;
      const current = chunk.subarray(0, bytesRead);
      const combined = carry.length > 0 ? Buffer.concat([carry, current]) : current;
      for (const finding of findSecretFindings(
        { [displayPath]: releaseArtifactDecodings(combined) },
        configuredSecrets,
      )) {
        addFinding(findings, seen, finding.path, finding.rule);
      }
      carry = Buffer.from(combined.subarray(Math.max(0, combined.length - overlapBytes)));
    }
    if (totalBytesRead !== stats.size) {
      throw new Error("Release artifact could not be scanned completely.");
    }
  } catch {
    scanFailed = true;
    addFinding(findings, seen, displayPath, "artifact-scan-error");
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        scanFailed = true;
        addFinding(findings, seen, displayPath, "artifact-scan-error");
      }
    }
  }

  return !scanFailed;
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
