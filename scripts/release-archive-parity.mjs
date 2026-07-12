import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  isDirectExecution,
  validateVersionManifest,
  validateTrustedVersionManifest,
} from "./archive-static-version.mjs";
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

function readTrackedBlob(rootDir, ref, relativePath) {
  const gitPath = relativePath.replace(/\\/g, "/");
  const objectId = readTrackedBlobId(rootDir, ref, relativePath);
  const result = spawnSync("git", ["cat-file", "blob", objectId], {
    cwd: rootDir,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error(`Tracked Git blob is missing or unreadable at ${ref}:${gitPath}.`);
  }
  return result.stdout;
}

function readTrackedBlobId(rootDir, ref, relativePath) {
  const gitPath = relativePath.replace(/\\/g, "/");
  const result = spawnSync("git", ["rev-parse", "--verify", `${ref}:${gitPath}`], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Tracked Git blob is missing or unreadable at ${ref}:${gitPath}.`);
  }
  return result.stdout.trim();
}

function resolveGitCommit(rootDir, ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Required historical archive base ref could not be resolved: ${ref}.`);
  }
  return result.stdout.trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSameBytes(actualPath, expectedBytes, message) {
  if (readFileSync(actualPath).compare(expectedBytes) !== 0) {
    throw new Error(message);
  }
}

function parseTrackedManifest(bytes, label, { requireDigests = true } = {}) {
  try {
    const manifest = JSON.parse(bytes.toString("utf8"));
    return requireDigests ? validateTrustedVersionManifest(manifest) : validateVersionManifest(manifest);
  } catch (error) {
    const suffix = requireDigests ? " or lacks trusted digest metadata" : "";
    throw new Error(`${label} is invalid${suffix}.`, { cause: error });
  }
}

export function runReleaseArchiveParity({
  rootDir = resolve("."),
  distDir = join(rootDir, "dist-static"),
  strict = false,
  historicalOnly = false,
  expectedTag,
  expectedVersion,
  baseRef,
  readGitBlob = readTrackedBlob,
  readGitBlobId = readTrackedBlobId,
  resolveBaseRef = resolveGitCommit,
} = {}) {
  if (!strict && !historicalOnly) {
    assertCurrentReleaseMatchesArchive({ rootDir, distDir });
    return;
  }

  const packageVersion = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"))?.version;
  const manifestRelativePath = join("static-versions", "manifest.json");
  const manifestPath = assertSafeReleaseFile(rootDir, join(rootDir, manifestRelativePath), "Static version manifest");
  const manifest = validateTrustedVersionManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  if (strict) {
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
  }

  const headManifestBytes = readGitBlob(rootDir, "HEAD", manifestRelativePath);
  assertSameBytes(manifestPath, headManifestBytes, "Working-tree manifest must be byte-identical to the tracked HEAD manifest.");
  const headManifest = parseTrackedManifest(headManifestBytes, "Tracked HEAD manifest");
  if (JSON.stringify(headManifest) !== JSON.stringify(manifest)) {
    throw new Error("Tracked HEAD manifest must agree with the release manifest.");
  }

  for (const version of manifest.versions) {
    const archiveRelativePath = join("static-versions", "versions", `v${version}`, "index.html");
    const archivePath = assertSafeReleaseFile(rootDir, join(rootDir, archiveRelativePath), `Source archive v${version}`);
    const archiveBytes = readFileSync(archivePath);
    if (sha256(archiveBytes) !== manifest.sha256[version]) {
      throw new Error(`Source archive v${version} does not match its trusted manifest digest.`);
    }
    const headArchiveBytes = readGitBlob(rootDir, "HEAD", archiveRelativePath);
    if (archiveBytes.compare(headArchiveBytes) !== 0) {
      throw new Error(`Working-tree archive v${version} must be byte-identical to the tracked HEAD archive.`);
    }
    if (strict) {
      assertSafeReleaseFile(
        rootDir,
        join(distDir, "versions", `v${version}`, "index.html"),
        `Built archive v${version}`,
      );
    }
  }

  if (strict) {
    const currentArchiveRelativePath = join("static-versions", "versions", `v${packageVersion}`, "index.html");
    const currentArchivePath = join(rootDir, currentArchiveRelativePath);
    const currentArchiveBytes = readFileSync(currentArchivePath);
    for (const fileName of ["index.html", "gpt-image-2-studio-lite.html"]) {
      const releasePath = assertSafeReleaseFile(rootDir, join(distDir, fileName), `Current release ${fileName}`);
      assertSameBytes(
        releasePath,
        currentArchiveBytes,
        `Current release ${fileName} must be byte-identical to ${currentArchiveRelativePath.replace(/\\/g, "/")}.`,
      );
    }
  }

  const requestedBaseRef = baseRef || process.env.STATIC_ARCHIVE_BASE_REF || "HEAD^";
  const resolvedBaseRef = resolveBaseRef(rootDir, requestedBaseRef);
  const baseManifest = parseTrackedManifest(
    readGitBlob(rootDir, resolvedBaseRef, manifestRelativePath),
    "Historical archive base manifest",
    { requireDigests: false },
  );
  const historicalVersions = manifest.versions.filter((version) => version !== manifest.latestStable);
  const baseHistoricalVersions = baseManifest.versions.filter((version) => version !== manifest.latestStable);
  for (const version of baseHistoricalVersions) {
    if (!historicalVersions.includes(version)) {
      throw new Error(`Historical archive v${version} was removed from the current manifest.`);
    }
  }
  for (const version of historicalVersions) {
    if (!baseManifest.versions.includes(version)) {
      throw new Error(`Historical archive digest metadata changed for v${version}.`);
    }
    const archiveRelativePath = join("static-versions", "versions", `v${version}`, "index.html");
    const headBytes = readGitBlob(rootDir, "HEAD", archiveRelativePath);
    const baseBytes = readGitBlob(rootDir, resolvedBaseRef, archiveRelativePath);
    const baseDigest = sha256(baseBytes);
    const baseManifestDigest = baseManifest.sha256?.[version];
    if (baseManifestDigest && baseManifestDigest.toLowerCase() !== baseDigest) {
      throw new Error(`Historical base archive v${version} does not match its manifest digest metadata.`);
    }
    if (manifest.sha256[version].toLowerCase() !== baseDigest) {
      throw new Error(`Historical archive digest metadata changed for v${version}.`);
    }
    const headBlobId = readGitBlobId(rootDir, "HEAD", archiveRelativePath);
    const baseBlobId = readGitBlobId(rootDir, resolvedBaseRef, archiveRelativePath);
    if (headBlobId !== baseBlobId) {
      throw new Error(`Historical archive blob changed across commits for v${version}.`);
    }
    if (headBytes.compare(baseBytes) !== 0) {
      throw new Error(`Historical archive bytes changed across commits for v${version}.`);
    }
  }

  if (strict) {
    assertSafeReleaseFile(rootDir, join(distDir, "versions", "manifest.json"), "Built static version manifest");
    assertVersionManifestAndArchives({ rootDir, distDir });
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  try {
    runReleaseArchiveParity({
      strict: process.argv.includes("--strict"),
      historicalOnly: process.argv.includes("--historical-only"),
    });
    console.log("Release archive parity check passed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown release archive parity failure.";
    console.error(`Release archive parity check failed: ${message}`);
    process.exit(1);
  }
}
