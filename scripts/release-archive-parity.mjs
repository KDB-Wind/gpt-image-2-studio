import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { isDirectExecution, validateVersionManifest } from "./archive-static-version.mjs";
import {
  assertCurrentReleaseMatchesArchive,
  assertVersionManifestAndArchives,
} from "./static-site-check.mjs";

function isOutsideRoot(relativePath) {
  return relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
}

function assertSafeReleaseFile(rootDir, filePath, label) {
  const resolvedRoot = resolve(rootDir);
  const resolvedFile = resolve(filePath);
  const relativeFile = relative(resolvedRoot, resolvedFile);
  if (!relativeFile || isOutsideRoot(relativeFile)) {
    throw new Error(`${label} must remain inside the release workspace.`);
  }

  let currentPath = resolvedRoot;
  for (const segment of relativeFile.split(/[\\/]/)) {
    currentPath = join(currentPath, segment);
    let stats;
    try {
      stats = lstatSync(currentPath);
    } catch {
      throw new Error(`${label} is missing or unreadable.`);
    }

    if (stats.isSymbolicLink()) {
      throw new Error(`${label} must not use link or reparse traversal.`);
    }
  }

  let realRoot;
  let realFile;
  try {
    realRoot = realpathSync(resolvedRoot);
    realFile = realpathSync(resolvedFile);
  } catch {
    throw new Error(`${label} could not be resolved to a safe release path.`);
  }

  if (isOutsideRoot(relative(realRoot, realFile))) {
    throw new Error(`${label} resolves outside the release workspace.`);
  }

  if (!lstatSync(resolvedFile).isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }

  return resolvedFile;
}

function readTrackedHeadArchive(rootDir, archiveRelativePath) {
  const gitPath = archiveRelativePath.replace(/\\/g, "/");
  const result = spawnSync("git", ["show", `HEAD:${gitPath}`], {
    cwd: rootDir,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error("Tracked HEAD archive is missing or could not be read.");
  }

  return result.stdout;
}

function assertSameBytes(actualPath, expectedBytes, message) {
  if (readFileSync(actualPath).compare(expectedBytes) !== 0) {
    throw new Error(message);
  }
}

export function runReleaseArchiveParity({
  rootDir = resolve("."),
  distDir = join(rootDir, "dist-static"),
  strict = false,
  expectedTag,
  expectedVersion,
  readHeadArchive = readTrackedHeadArchive,
} = {}) {
  if (!strict) {
    assertCurrentReleaseMatchesArchive({ rootDir, distDir });
    return;
  }

  const packageVersion = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"))?.version;
  const manifest = validateVersionManifest(
    JSON.parse(readFileSync(join(rootDir, "static-versions", "manifest.json"), "utf8")),
  );
  if (packageVersion !== manifest.latestStable) {
    throw new Error("Package version must equal manifest latestStable for strict release parity.");
  }

  const releaseTag = expectedTag || process.env.RELEASE_TAG || `v${packageVersion}`;
  if (releaseTag !== `v${packageVersion}`) {
    throw new Error("Release tag must match the package version in strict release parity.");
  }

  const releaseVersion = expectedVersion || process.env.RELEASE_VERSION || packageVersion;
  if (releaseVersion !== packageVersion) {
    throw new Error("Release version must match the package version in strict release parity.");
  }

  const archiveRelativePath = join("static-versions", "versions", `v${packageVersion}`, "index.html");
  const archivePath = assertSafeReleaseFile(rootDir, join(rootDir, archiveRelativePath), "Source release archive");
  const distArchivePath = assertSafeReleaseFile(
    rootDir,
    join(distDir, "versions", `v${packageVersion}`, "index.html"),
    "Built versioned release archive",
  );
  const releasePaths = ["index.html", "gpt-image-2-studio-lite.html"].map((fileName) => ({
    fileName,
    path: assertSafeReleaseFile(rootDir, join(distDir, fileName), `Current release ${fileName}`),
  }));
  const archiveBytes = readFileSync(archivePath);

  for (const releasePath of releasePaths) {
    assertSameBytes(
      releasePath.path,
      archiveBytes,
      `Current release ${releasePath.fileName} must be byte-identical to ${archiveRelativePath.replace(/\\/g, "/")}.`,
    );
  }
  assertSameBytes(
    distArchivePath,
    archiveBytes,
    `Built versioned release archive must be byte-identical to ${archiveRelativePath.replace(/\\/g, "/")}.`,
  );

  let headArchiveBytes;
  try {
    headArchiveBytes = readHeadArchive(rootDir, archiveRelativePath);
  } catch {
    throw new Error("Tracked HEAD archive is missing or could not be read.");
  }
  if (!Buffer.isBuffer(headArchiveBytes)) {
    throw new Error("Tracked HEAD archive did not return immutable bytes.");
  }
  if (archiveBytes.compare(headArchiveBytes) !== 0) {
    throw new Error("Working-tree archive must be byte-identical to the tracked HEAD archive.");
  }

  assertVersionManifestAndArchives({ rootDir, distDir });
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  try {
    runReleaseArchiveParity({ strict: process.argv.includes("--strict") });
    console.log("Release archive parity check passed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown release archive parity failure.";
    console.error(`Release archive parity check failed: ${message}`);
    process.exit(1);
  }
}
