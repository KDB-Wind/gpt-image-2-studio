import * as nodeFs from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rcompare, valid } from "semver";

const defaultRootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TRANSACTION_LEASE_MS = 10 * 60 * 1000;

export class ArchiveLockOwnershipError extends Error {
  constructor(lockPath, transactionId) {
    super(`Archive lock ownership lost for ${lockPath} (${transactionId}).`);
    this.name = "ArchiveLockOwnershipError";
  }
}

export function isDirectExecution(moduleUrl, argvPath) {
  return typeof argvPath === "string" && moduleUrl === pathToFileURL(argvPath).href;
}

export function validateVersionManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.versions)) {
    throw new Error("Static version manifest must contain a versions array.");
  }

  if (typeof manifest.latestStable !== "string") {
    throw new Error("Static version manifest must contain latestStable.");
  }

  for (const version of manifest.versions) {
    if (typeof version !== "string" || valid(version) !== version) {
      throw new Error(`Invalid static version SemVer: ${version}`);
    }
  }

  if (new Set(manifest.versions).size !== manifest.versions.length) {
    throw new Error("Static version manifest contains duplicate versions.");
  }

  const sortedVersions = [...manifest.versions].sort(rcompare);

  if (JSON.stringify(sortedVersions) !== JSON.stringify(manifest.versions)) {
    throw new Error("Static version manifest versions must be sorted newest first.");
  }

  if (!manifest.versions.includes(manifest.latestStable)) {
    throw new Error("Static version manifest latestStable must be listed in versions.");
  }

  return manifest;
}

function readManifest(rootDir, fs) {
  const manifestPath = join(rootDir, "static-versions", "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Static version manifest is missing: ${manifestPath}`);
  }

  const manifest = validateVersionManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));

  for (const version of manifest.versions) {
    const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");

    if (!fs.existsSync(archivePath)) {
      throw new Error(`Static version manifest references missing archive: ${archivePath}`);
    }
  }

  return { manifestPath, manifest };
}

function temporaryPath(path) {
  return `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
}

function filesAreByteIdentical(fs, leftPath, rightPath) {
  return fs.readFileSync(leftPath).compare(fs.readFileSync(rightPath)) === 0;
}

function writeManifestAtomically({
  fs,
  manifestPath,
  manifest,
  temporaryManifestPath = temporaryPath(manifestPath),
  beforeRename,
}) {
  let temporaryManifestCreated = false;

  try {
    fs.writeFileSync(temporaryManifestPath, JSON.stringify(manifest, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    temporaryManifestCreated = true;
    beforeRename?.();
    fs.renameSync(temporaryManifestPath, manifestPath);
    temporaryManifestCreated = false;
  } catch (error) {
    if (temporaryManifestCreated || fs.existsSync(temporaryManifestPath)) {
      fs.rmSync(temporaryManifestPath, { force: true });
    }

    throw error;
  }
}

function writeAll(fs, fileDescriptor, buffer) {
  let offset = 0;

  while (offset < buffer.length) {
    const written = fs.writeSync(fileDescriptor, buffer, offset, buffer.length - offset, null);

    if (!Number.isInteger(written) || written <= 0) {
      throw new Error("Unable to complete static version transaction marker write.");
    }

    offset += written;
  }
}

function transactionMarkerPath(rootDir, version) {
  return join(rootDir, "static-versions", `.archive-v${version}.txn`);
}

function archiveLockPath(rootDir) {
  return join(rootDir, "static-versions", ".archive-static.lock");
}

function markerHasTransactionId(fs, markerPath, transactionId) {
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    return marker?.transactionId === transactionId;
  } catch {
    return false;
  }
}

function removeTransactionMarkerIfOwned({ fs, markerPath, transactionId }) {
  if (!markerHasTransactionId(fs, markerPath, transactionId)) {
    return false;
  }

  fs.rmSync(markerPath, { force: true });
  return true;
}

function assertArchiveLockOwned({ fs, lockPath, transactionId }) {
  if (!markerHasTransactionId(fs, lockPath, transactionId)) {
    throw new ArchiveLockOwnershipError(lockPath, transactionId);
  }
}

function isSafeTransactionTempPath(candidatePath, basePath) {
  return (
    typeof candidatePath === "string" &&
    dirname(candidatePath) === dirname(basePath) &&
    basename(candidatePath).startsWith(`${basename(basePath)}.`) &&
    candidatePath.endsWith(".tmp")
  );
}

function cleanupTransaction({ fs, markerPath, transaction, archivePath, manifestPath }) {
  for (const [candidatePath, basePath] of [
    [transaction.temporaryArchivePath, archivePath],
    [transaction.temporaryManifestPath, manifestPath],
  ]) {
    if (isSafeTransactionTempPath(candidatePath, basePath)) {
      fs.rmSync(candidatePath, { force: true });
    }
  }

  removeTransactionMarkerIfOwned({ fs, markerPath, transactionId: transaction.transactionId });
}

function readTransaction(fs, markerPath, version) {
  let transaction;

  try {
    transaction = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  } catch (error) {
    throw new Error(`Static version transaction marker is invalid: ${markerPath}`, { cause: error });
  }

  if (
    !transaction ||
    (version !== undefined && transaction.version !== version) ||
    typeof transaction.transactionId !== "string" ||
    transaction.transactionId.length === 0 ||
    !Number.isFinite(transaction.createdAt)
  ) {
    throw new Error(`Static version transaction marker does not match ${version ?? "the expected transaction"}: ${markerPath}`);
  }

  return transaction;
}

function isTransactionActive(transaction, { now, processKill }) {
  const age = now - transaction.createdAt;

  if (!Number.isFinite(age) || age < TRANSACTION_LEASE_MS) {
    try {
      processKill(transaction.pid, 0);
    } catch {
      // An in-lease process error is active or unknown, so do not clean it.
    }

    return true;
  }

  return false;
}

function writeTransactionMarker({ fs, markerPath, transaction, temporaryMarkerPath = temporaryPath(markerPath) }) {
  let fileDescriptor;
  let temporaryMarkerCreated = false;

  try {
    fileDescriptor = fs.openSync(temporaryMarkerPath, "wx");
    temporaryMarkerCreated = true;
    writeAll(fs, fileDescriptor, Buffer.from(JSON.stringify(transaction) + "\n", "utf8"));
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.linkSync(temporaryMarkerPath, markerPath);
    fs.unlinkSync(temporaryMarkerPath);
    temporaryMarkerCreated = false;
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {
        // Keep the original marker write failure.
      }
    }

    if (temporaryMarkerCreated || fs.existsSync(temporaryMarkerPath)) {
      fs.rmSync(temporaryMarkerPath, { force: true });
    }

    removeTransactionMarkerIfOwned({ fs, markerPath, transactionId: transaction.transactionId });
    throw error;
  }
}

function acquireArchiveLock({ fs, lockPath, transaction, now, processKill }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      writeTransactionMarker({ fs, markerPath: lockPath, transaction });
      return;
    } catch (error) {
      if (error?.code !== "EEXIST" || !fs.existsSync(lockPath)) {
        throw error;
      }

      const existingTransaction = readTransaction(fs, lockPath);

      if (isTransactionActive(existingTransaction, { now, processKill })) {
        throw new Error(`Static archive lock is in progress for ${transaction.version}.`);
      }

      if (!removeTransactionMarkerIfOwned({ fs, markerPath: lockPath, transactionId: existingTransaction.transactionId })) {
        throw new ArchiveLockOwnershipError(lockPath, existingTransaction.transactionId);
      }
    }
  }

  throw new Error(`Unable to acquire static archive lock: ${lockPath}`);
}

function recoverStaleTransaction({
  fs,
  markerPath,
  transaction,
  version,
  archivePath,
  manifestPath,
  manifest,
  nextManifest,
  releaseHtmlPath,
  now,
  processKill,
  lockPath,
  ownerTransactionId,
}) {
  if (isTransactionActive(transaction, { now, processKill })) {
    throw new Error(`Static version archive transaction is in progress for ${version}.`);
  }

  assertArchiveLockOwned({ fs, lockPath, transactionId: ownerTransactionId });

  if (fs.existsSync(archivePath)) {
    if (manifest.versions.includes(version)) {
      cleanupTransaction({ fs, markerPath, transaction, archivePath, manifestPath });
      assertArchiveLockOwned({ fs, lockPath, transactionId: ownerTransactionId });
      return false;
    }

    if (!filesAreByteIdentical(fs, archivePath, releaseHtmlPath)) {
      throw new Error(`Published archive does not match the release HTML: ${archivePath}`);
    }

    assertArchiveLockOwned({ fs, lockPath, transactionId: ownerTransactionId });
    writeManifestAtomically({
      fs,
      manifestPath,
      manifest: nextManifest,
      beforeRename: () => assertArchiveLockOwned({ fs, lockPath, transactionId: ownerTransactionId }),
    });
    assertArchiveLockOwned({ fs, lockPath, transactionId: ownerTransactionId });
    cleanupTransaction({ fs, markerPath, transaction, archivePath, manifestPath });
    assertArchiveLockOwned({ fs, lockPath, transactionId: ownerTransactionId });
    return true;
  }

  assertArchiveLockOwned({ fs, lockPath, transactionId: ownerTransactionId });
  cleanupTransaction({ fs, markerPath, transaction, archivePath, manifestPath });
  assertArchiveLockOwned({ fs, lockPath, transactionId: ownerTransactionId });
  return false;
}

export function archiveStaticVersion({ rootDir = defaultRootDir, fs: fsOverrides = {}, now = Date.now(), processKill = process.kill } = {}) {
  const fs = { ...nodeFs, ...fsOverrides };
  const packageJson = JSON.parse(fs.readFileSync(join(rootDir, "package.json"), "utf8"));
  const version = packageJson.version;

  if (typeof version !== "string" || valid(version) !== version) {
    throw new Error(`Invalid package version SemVer: ${version}`);
  }

  const releaseHtmlPath = join(rootDir, "dist-static", "gpt-image-2-studio-lite.html");
  const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");
  const archiveDir = dirname(archivePath);
  const versionsDir = dirname(archiveDir);
  const manifestPath = join(rootDir, "static-versions", "manifest.json");
  const markerPath = transactionMarkerPath(rootDir, version);
  const lockPath = archiveLockPath(rootDir);
  const temporaryArchivePath = temporaryPath(archivePath);
  const temporaryManifestPath = temporaryPath(manifestPath);
  const transaction = {
    transactionId: randomUUID(),
    pid: process.pid,
    createdAt: now,
    version,
    temporaryArchivePath,
    temporaryManifestPath,
  };
  let archiveDirExisted = false;
  let versionsDirExisted = false;
  let temporaryArchiveCreated = false;
  let archiveCreated = false;
  let manifestCommitted = false;
  let transactionMarkerCreated = false;
  let lockAcquired = false;

  try {
    acquireArchiveLock({ fs, lockPath, transaction, now, processKill });
    lockAcquired = true;
    const { manifest } = readManifest(rootDir, fs);

    if (!fs.existsSync(releaseHtmlPath)) {
      throw new Error(`Latest inlined HTML is missing: ${releaseHtmlPath}`);
    }

    const nextVersions = [...new Set([version, ...manifest.versions])].sort(rcompare);
    const nextManifest = validateVersionManifest({ latestStable: version, versions: nextVersions });

    if (fs.existsSync(markerPath)) {
      const previousTransaction = readTransaction(fs, markerPath, version);
      const recovered = recoverStaleTransaction({
        fs,
        markerPath,
        transaction: previousTransaction,
        version,
        archivePath,
        manifestPath,
        manifest,
        nextManifest,
        releaseHtmlPath,
        now,
        processKill,
        lockPath,
        ownerTransactionId: transaction.transactionId,
      });

      if (recovered) {
        return;
      }
    }

    if (fs.existsSync(archivePath)) {
      if (manifest.versions.includes(version)) {
        throw new Error(`Static version archive already exists: ${archivePath}`);
      }

      if (!filesAreByteIdentical(fs, archivePath, releaseHtmlPath)) {
        throw new Error(`Published archive does not match the release HTML: ${archivePath}`);
      }

      assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
      writeManifestAtomically({
        fs,
        manifestPath,
        manifest: nextManifest,
        beforeRename: () => assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId }),
      });
      assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
      return;
    }

    if (manifest.versions.includes(version)) {
      throw new Error(`Static version archive already exists: ${archivePath}`);
    }

    archiveDirExisted = fs.existsSync(archiveDir);
    versionsDirExisted = fs.existsSync(versionsDir);
    writeTransactionMarker({ fs, markerPath, transaction });
    transactionMarkerCreated = true;
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.copyFileSync(releaseHtmlPath, temporaryArchivePath, fs.constants.COPYFILE_EXCL);
    temporaryArchiveCreated = true;
    assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
    fs.linkSync(temporaryArchivePath, archivePath);
    archiveCreated = true;
    assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
    fs.unlinkSync(temporaryArchivePath);
    temporaryArchiveCreated = false;
    assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
    writeManifestAtomically({
      fs,
      manifestPath,
      manifest: nextManifest,
      temporaryManifestPath,
      beforeRename: () => assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId }),
    });
    manifestCommitted = true;
    assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
    removeTransactionMarkerIfOwned({ fs, markerPath, transactionId: transaction.transactionId });
    transactionMarkerCreated = false;
    assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
  } catch (error) {
    if (!lockAcquired) {
      throw error;
    }

    try {
      assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
    } catch (ownershipError) {
      throw ownershipError;
    }

    if (temporaryArchiveCreated || fs.existsSync(temporaryArchivePath)) {
      assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
      fs.rmSync(temporaryArchivePath, { force: true });
    }

    if (fs.existsSync(temporaryManifestPath)) {
      assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
      fs.rmSync(temporaryManifestPath, { force: true });
    }

    if (archiveCreated && !manifestCommitted) {
      assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
      fs.rmSync(archivePath, { force: true });
    }

    if (transactionMarkerCreated) {
      assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
      removeTransactionMarkerIfOwned({ fs, markerPath, transactionId: transaction.transactionId });
    }

    if (!archiveDirExisted) {
      assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
      try {
        fs.rmdirSync(archiveDir);
      } catch {
        // Another process may have populated the directory after the exclusive create failed.
      }
    }

    if (!versionsDirExisted) {
      assertArchiveLockOwned({ fs, lockPath, transactionId: transaction.transactionId });
      try {
        fs.rmdirSync(versionsDir);
      } catch {
        // Keep a directory that is no longer empty.
      }
    }

    throw error;
  } finally {
    if (lockAcquired) {
      removeTransactionMarkerIfOwned({ fs, markerPath: lockPath, transactionId: transaction.transactionId });
    }
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  try {
    archiveStaticVersion();
    console.log("Static version archive created.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
