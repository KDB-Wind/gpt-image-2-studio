import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { constants, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as archiveStaticVersionModule from "./archive-static-version.mjs";
import {
  archiveStaticVersion,
  isDirectExecution,
  TRANSACTION_LEASE_MS,
  validateVersionManifest,
} from "./archive-static-version.mjs";
import { copyStaticArchives, inlineStaticHtml } from "./inline-static-html.mjs";
import { assertStaticVersionArchivesMatch, runStaticSiteCheck } from "./static-site-check.mjs";

function createTempRoot() {
  return mkdtempSync(join(tmpdir(), "chat-to-image-static-versioning-"));
}

function writeJson(path, value) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeSourceArchive(rootDir, version, contents) {
  const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");
  mkdirSync(join(archivePath, ".."), { recursive: true });
  writeFileSync(archivePath, contents, "utf8");
  return archivePath;
}

function versionedArchiveHtml({ latestStable, versions }) {
  const quotedVersions = versions.map((version) => `\`${version}\``).join(",");
  return `<html><script>const manifest={latestStable:\`${latestStable}\`,versions:[${quotedVersions}]}</script></html>\n`;
}

function createSiteFixture({
  sourceContents = versionedArchiveHtml({ latestStable: "1.0.0", versions: ["1.0.0"] }),
  distContents = sourceContents,
} = {}) {
  const rootDir = createTempRoot();
  const distDir = join(rootDir, "dist-static");
  const manifest = { latestStable: "1.0.0", versions: ["1.0.0"] };
  const appHtml = '<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024"</script>';

  writeJson(join(rootDir, "static-versions", "manifest.json"), manifest);
  writeSourceArchive(rootDir, "1.0.0", sourceContents);
  writeJson(join(distDir, "versions", "manifest.json"), manifest);
  mkdirSync(join(distDir, "versions", "v1.0.0"), { recursive: true });
  writeFileSync(join(distDir, "versions", "v1.0.0", "index.html"), distContents, "utf8");
  writeFileSync(join(distDir, "index.html"), appHtml, "utf8");
  writeFileSync(join(distDir, "gpt-image-2-studio-lite.html"), appHtml, "utf8");

  return { rootDir, distDir };
}

describe("static version archives", () => {
  it("runs the static build through the current Node and npm CLI paths", () => {
    const calls = [];
    const runStaticBuildCommand = archiveStaticVersionModule.runStaticBuildCommand;

    expect(typeof runStaticBuildCommand).toBe("function");
    runStaticBuildCommand({
      rootDir: "C:\\repo",
      execPath: "C:\\node\\node.exe",
      npmExecPath: "C:\\node\\node_modules\\npm\\bin\\npm-cli.js",
      spawnSyncImpl: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });

    expect(calls).toEqual([
      {
        command: "C:\\node\\node.exe",
        args: ["C:\\node\\node_modules\\npm\\bin\\npm-cli.js", "run", "build:static"],
        options: { cwd: "C:\\repo", stdio: "inherit" },
      },
    ]);
  });

  it("builds after advancing the manifest so a new archive embeds itself", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const releaseHtmlPath = join(rootDir, "dist-static", "gpt-image-2-studio-lite.html");

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(
      rootDir,
      "1.2.2",
      versionedArchiveHtml({ latestStable: "1.2.2", versions: ["1.2.2"] }),
    );
    mkdirSync(join(releaseHtmlPath, ".."), { recursive: true });
    writeFileSync(
      releaseHtmlPath,
      versionedArchiveHtml({ latestStable: "1.2.2", versions: ["1.2.2"] }),
      "utf8",
    );

    archiveStaticVersion({
      rootDir,
      prepareReleaseHtml: ({ manifest }) => {
        expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(manifest);
        writeFileSync(releaseHtmlPath, versionedArchiveHtml(manifest), "utf8");
      },
    });

    expect(readFileSync(join(rootDir, "static-versions", "versions", "v1.2.3", "index.html"), "utf8")).toContain(
      "latestStable:`1.2.3`,versions:[`1.2.3`,`1.2.2`]",
    );
  });

  it("rejects a second prepared archive attempt before rebuilding or changing bytes", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const releaseHtmlPath = join(rootDir, "dist-static", "gpt-image-2-studio-lite.html");
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");
    let buildCount = 0;

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(
      rootDir,
      "1.2.2",
      versionedArchiveHtml({ latestStable: "1.2.2", versions: ["1.2.2"] }),
    );
    mkdirSync(join(releaseHtmlPath, ".."), { recursive: true });

    const prepareReleaseHtml = ({ manifest }) => {
      buildCount += 1;
      writeFileSync(releaseHtmlPath, versionedArchiveHtml(manifest), "utf8");
    };

    archiveStaticVersion({ rootDir, prepareReleaseHtml });
    const beforeArchiveHash = sha256(archivePath);
    const beforeManifestHash = sha256(manifestPath);

    expect(() => archiveStaticVersion({ rootDir, prepareReleaseHtml })).toThrow(/already exists/);
    expect(buildCount).toBe(1);
    expect(sha256(archivePath)).toBe(beforeArchiveHash);
    expect(sha256(manifestPath)).toBe(beforeManifestHash);
  });

  it("rolls back the manifest when the prepared static build fails", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const beforeManifest = { latestStable: "1.2.2", versions: ["1.2.2"] };

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, beforeManifest);
    writeSourceArchive(
      rootDir,
      "1.2.2",
      versionedArchiveHtml({ latestStable: "1.2.2", versions: ["1.2.2"] }),
    );

    expect(() =>
      archiveStaticVersion({
        rootDir,
        prepareReleaseHtml: () => {
          throw new Error("static build failed");
        },
      }),
    ).toThrow(/static build failed/);
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(beforeManifest);
    expect(existsSync(join(rootDir, "static-versions", "versions", "v1.2.3", "index.html"))).toBe(false);
  });

  it("recovers an interrupted prepared transaction before strict manifest validation and retries successfully", () => {
    const rootDir = createTempRoot();
    const version = "1.2.3";
    const previousManifest = { latestStable: "1.2.2", versions: ["1.2.2"] };
    const nextManifest = { latestStable: version, versions: [version, "1.2.2"] };
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");
    const distManifestPath = join(rootDir, "dist-static", "versions", "manifest.json");
    const distArchivePath = join(rootDir, "dist-static", "versions", `v${version}`, "index.html");
    const markerPath = join(rootDir, "static-versions", `.archive-v${version}.txn`);
    const releaseHtmlPath = join(rootDir, "dist-static", "gpt-image-2-studio-lite.html");

    writeJson(join(rootDir, "package.json"), { version });
    writeJson(manifestPath, nextManifest);
    writeSourceArchive(
      rootDir,
      "1.2.2",
      versionedArchiveHtml({ latestStable: "1.2.2", versions: ["1.2.2"] }),
    );
    writeJson(distManifestPath, nextManifest);
    mkdirSync(join(distArchivePath, ".."), { recursive: true });
    writeFileSync(distArchivePath, "partial current archive", "utf8");
    writeJson(markerPath, {
      mode: "prepared-release",
      transactionId: "interrupted-prepared-release",
      pid: process.pid,
      createdAt: Date.now() - TRANSACTION_LEASE_MS - 1,
      version,
      previousManifest,
      nextManifest,
      manifestPath,
      archivePath,
      distManifestPath,
      distArchivePath,
      temporaryArchivePath: `${archivePath}.interrupted.tmp`,
      temporaryManifestPath: `${manifestPath}.interrupted.tmp`,
    });

    archiveStaticVersion({
      rootDir,
      prepareReleaseHtml: ({ manifest }) => {
        expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(manifest);
        expect(existsSync(distArchivePath)).toBe(false);
        writeFileSync(releaseHtmlPath, versionedArchiveHtml(manifest), "utf8");
      },
    });

    expect(existsSync(markerPath)).toBe(false);
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(nextManifest);
    expect(readFileSync(archivePath, "utf8")).toContain("latestStable:`1.2.3`");
  });

  it("rejects an interrupted transaction whose recorded paths escape the expected archive roots", () => {
    const rootDir = createTempRoot();
    const version = "1.2.3";
    const previousManifest = { latestStable: "1.2.2", versions: ["1.2.2"] };
    const nextManifest = { latestStable: version, versions: [version, "1.2.2"] };
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");
    const distManifestPath = join(rootDir, "dist-static", "versions", "manifest.json");
    const markerPath = join(rootDir, "static-versions", `.archive-v${version}.txn`);
    const outsidePath = join(rootDir, "..", "outside-v1.2.3", "index.html");

    writeJson(join(rootDir, "package.json"), { version });
    writeJson(manifestPath, nextManifest);
    writeSourceArchive(
      rootDir,
      "1.2.2",
      versionedArchiveHtml({ latestStable: "1.2.2", versions: ["1.2.2"] }),
    );
    mkdirSync(join(outsidePath, ".."), { recursive: true });
    writeFileSync(outsidePath, "must remain", "utf8");
    writeJson(markerPath, {
      mode: "prepared-release",
      transactionId: "malformed-prepared-release",
      pid: process.pid,
      createdAt: Date.now() - TRANSACTION_LEASE_MS - 1,
      version,
      previousManifest,
      nextManifest,
      manifestPath,
      archivePath,
      distManifestPath,
      distArchivePath: outsidePath,
      temporaryArchivePath: `${archivePath}.interrupted.tmp`,
      temporaryManifestPath: `${manifestPath}.interrupted.tmp`,
    });

    expect(() => archiveStaticVersion({ rootDir, prepareReleaseHtml: () => undefined })).toThrow(
      /transaction path.*expected current-version archive roots/i,
    );
    expect(readFileSync(outsidePath, "utf8")).toBe("must remain");
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(nextManifest);
    expect(existsSync(markerPath)).toBe(true);
  });

  it("rejects interrupted recovery through a junction or symlink and preserves external files", () => {
    const rootDir = createTempRoot();
    const outsideDir = createTempRoot();
    const version = "1.2.3";
    const previousManifest = { latestStable: "1.2.2", versions: ["1.2.2"] };
    const nextManifest = { latestStable: version, versions: [version, "1.2.2"] };
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");
    const distManifestPath = join(rootDir, "dist-static", "versions", "manifest.json");
    const distArchiveDir = join(rootDir, "dist-static", "versions", `v${version}`);
    const distArchivePath = join(distArchiveDir, "index.html");
    const markerPath = join(rootDir, "static-versions", `.archive-v${version}.txn`);
    const outsideFile = join(outsideDir, "index.html");

    writeJson(join(rootDir, "package.json"), { version });
    writeJson(manifestPath, nextManifest);
    writeSourceArchive(rootDir, "1.2.2", versionedArchiveHtml(previousManifest));
    writeJson(distManifestPath, nextManifest);
    writeFileSync(outsideFile, "external file must survive", "utf8");
    symlinkSync(outsideDir, distArchiveDir, process.platform === "win32" ? "junction" : "dir");
    writeJson(markerPath, {
      mode: "prepared-release",
      transactionId: "junction-prepared-release",
      pid: process.pid,
      createdAt: Date.now() - TRANSACTION_LEASE_MS - 1,
      version,
      previousManifest,
      nextManifest,
      manifestPath,
      archivePath,
      distManifestPath,
      distArchivePath,
      temporaryArchivePath: `${archivePath}.interrupted.tmp`,
      temporaryManifestPath: `${manifestPath}.interrupted.tmp`,
    });

    expect(() => archiveStaticVersion({ rootDir, prepareReleaseHtml: () => undefined })).toThrow(/link|reparse|junction/i);
    expect(readFileSync(outsideFile, "utf8")).toBe("external file must survive");
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(nextManifest);
    expect(existsSync(markerPath)).toBe(true);
  });

  it("rejects recovery when the current manifest matches neither recorded state", () => {
    const rootDir = createTempRoot();
    const version = "1.2.3";
    const previousManifest = { latestStable: "1.2.2", versions: ["1.2.2"] };
    const nextManifest = { latestStable: version, versions: [version, "1.2.2"] };
    const tamperedManifest = { latestStable: "1.2.1", versions: ["1.2.1"] };
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");
    const distManifestPath = join(rootDir, "dist-static", "versions", "manifest.json");
    const distArchivePath = join(rootDir, "dist-static", "versions", `v${version}`, "index.html");
    const markerPath = join(rootDir, "static-versions", `.archive-v${version}.txn`);

    writeJson(join(rootDir, "package.json"), { version });
    writeJson(manifestPath, tamperedManifest);
    writeSourceArchive(rootDir, "1.2.1", versionedArchiveHtml(tamperedManifest));
    writeJson(distManifestPath, nextManifest);
    mkdirSync(join(distArchivePath, ".."), { recursive: true });
    writeFileSync(distArchivePath, "partial current archive", "utf8");
    writeJson(markerPath, {
      mode: "prepared-release",
      transactionId: "tampered-manifest-prepared-release",
      pid: process.pid,
      createdAt: Date.now() - TRANSACTION_LEASE_MS - 1,
      version,
      previousManifest,
      nextManifest,
      manifestPath,
      archivePath,
      distManifestPath,
      distArchivePath,
      temporaryArchivePath: `${archivePath}.interrupted.tmp`,
      temporaryManifestPath: `${manifestPath}.interrupted.tmp`,
    });

    expect(() => archiveStaticVersion({ rootDir, prepareReleaseHtml: () => undefined })).toThrow(/manifest.*recorded/i);
    expect(readFileSync(distArchivePath, "utf8")).toBe("partial current archive");
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(tamperedManifest);
    expect(existsSync(markerPath)).toBe(true);
  });

  it("archives the latest inlined HTML and updates the manifest on the first archive", () => {
    const rootDir = createTempRoot();
    const releaseHtmlPath = join(rootDir, "dist-static", "gpt-image-2-studio-lite.html");
    const priorArchivePath = join(rootDir, "static-versions", "versions", "v1.2.2", "index.html");

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(join(rootDir, "static-versions", "manifest.json"), {
      latestStable: "1.2.2",
      versions: ["1.2.2"],
    });
    mkdirSync(join(priorArchivePath, ".."), { recursive: true });
    writeFileSync(priorArchivePath, "<html>release 1.2.2</html>\n", "utf8");
    mkdirSync(join(releaseHtmlPath, ".."), { recursive: true });
    writeFileSync(releaseHtmlPath, "<html>release 1.2.3</html>\n", "utf8");

    archiveStaticVersion({ rootDir });

    expect(readFileSync(join(rootDir, "static-versions", "versions", "v1.2.3", "index.html"), "utf8")).toBe(
      "<html>release 1.2.3</html>\n",
    );
    expect(JSON.parse(readFileSync(join(rootDir, "static-versions", "manifest.json"), "utf8"))).toEqual({
      latestStable: "1.2.3",
      versions: ["1.2.3", "1.2.2"],
    });
  });

  it("refuses to archive when the manifest references a missing prior archive", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const newArchivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, {
      latestStable: "1.2.2",
      versions: ["1.2.2"],
    });
    const beforeManifest = readFileSync(manifestPath, "utf8");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");

    expect(() => archiveStaticVersion({ rootDir })).toThrow(/missing.*archive/i);
    expect(existsSync(newArchivePath)).toBe(false);
    expect(readFileSync(manifestPath, "utf8")).toBe(beforeManifest);
  });

  it("refuses to overwrite an existing source archive", () => {
    const rootDir = createTempRoot();
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(join(rootDir, "static-versions", "manifest.json"), {
      latestStable: "1.2.3",
      versions: ["1.2.3"],
    });
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>new</html>\n", "utf8");
    mkdirSync(join(archivePath, ".."), { recursive: true });
    writeFileSync(archivePath, "<html>immutable</html>\n", "utf8");
    const beforeHash = sha256(archivePath);

    expect(() => archiveStaticVersion({ rootDir })).toThrow(/already exists/);
    expect(sha256(archivePath)).toBe(beforeHash);
    expect(JSON.parse(readFileSync(join(rootDir, "static-versions", "manifest.json"), "utf8"))).toEqual({
      latestStable: "1.2.3",
      versions: ["1.2.3"],
    });
  });

  it("recovers a published matching archive when the manifest was not updated", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");
    const releaseHtml = "<html>release 1.2.3</html>\n";

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), releaseHtml, "utf8");
    mkdirSync(join(archivePath, ".."), { recursive: true });
    writeFileSync(archivePath, releaseHtml, "utf8");

    archiveStaticVersion({ rootDir });

    expect(readFileSync(archivePath, "utf8")).toBe(releaseHtml);
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual({
      latestStable: "1.2.3",
      versions: ["1.2.3", "1.2.2"],
    });
  });

  it("rejects a published archive whose bytes differ from the release", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");
    const transactionPath = join(rootDir, "static-versions", ".archive-v1.2.3.txn");
    const beforeManifest = { latestStable: "1.2.2", versions: ["1.2.2"] };

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, beforeManifest);
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");
    mkdirSync(join(archivePath, ".."), { recursive: true });
    writeFileSync(archivePath, "<html>different archive</html>\n", "utf8");
    writeJson(transactionPath, {
      transactionId: "mismatched-old-transaction",
      pid: process.pid,
      createdAt: Date.now() - TRANSACTION_LEASE_MS - 1,
      version: "1.2.3",
    });
    const beforeArchive = readFileSync(archivePath, "utf8");

    expect(() => archiveStaticVersion({ rootDir })).toThrow(/does not match.*release/i);
    expect(readFileSync(archivePath, "utf8")).toBe(beforeArchive);
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(beforeManifest);
    expect(existsSync(transactionPath)).toBe(true);
  });

  it("recovers and cleans only a stale transaction belonging to this version", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");
    const transactionPath = join(rootDir, "static-versions", ".archive-v1.2.3.txn");
    const temporaryArchivePath = `${archivePath}.stale.tmp`;
    const temporaryManifestPath = `${manifestPath}.stale.tmp`;
    const releaseHtml = "<html>release 1.2.3</html>\n";

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), releaseHtml, "utf8");
    mkdirSync(join(archivePath, ".."), { recursive: true });
    writeFileSync(archivePath, releaseHtml, "utf8");
    writeFileSync(temporaryArchivePath, "stale temp archive", "utf8");
    writeJson(temporaryManifestPath, { latestStable: "1.2.3", versions: ["1.2.3", "1.2.2"] });
    writeJson(transactionPath, {
      transactionId: "stale-transaction",
      pid: process.pid,
      createdAt: Date.now() - TRANSACTION_LEASE_MS - 1,
      version: "1.2.3",
      temporaryArchivePath,
      temporaryManifestPath,
    });

    archiveStaticVersion({ rootDir, now: Date.now() });

    expect(existsSync(transactionPath)).toBe(false);
    expect(existsSync(temporaryArchivePath)).toBe(false);
    expect(existsSync(temporaryManifestPath)).toBe(false);
  });

  it("does not recover or delete a transaction marker owned by a running process", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const transactionPath = join(rootDir, "static-versions", ".archive-v1.2.3.txn");
    const temporaryManifestPath = `${manifestPath}.running.tmp`;

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");
    writeJson(transactionPath, {
      transactionId: "active-transaction",
      pid: process.pid,
      createdAt: Date.now(),
      version: "1.2.3",
      temporaryManifestPath,
    });

    expect(() => archiveStaticVersion({ rootDir })).toThrow(/in progress/i);
    expect(existsSync(transactionPath)).toBe(true);
  });

  it("does not clean an in-lease marker when process liveness is unknown", () => {
    const rootDir = createTempRoot();
    const transactionPath = join(rootDir, "static-versions", ".archive-v1.2.3.txn");
    const createdAt = Date.now();

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(join(rootDir, "static-versions", "manifest.json"), { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");
    writeJson(transactionPath, {
      transactionId: "permission-unknown-transaction",
      pid: 424242,
      createdAt,
      version: "1.2.3",
    });

    const permissionDeniedKill = () => {
      const error = new Error("permission denied");
      error.code = "EPERM";
      throw error;
    };

    expect(() => archiveStaticVersion({ rootDir, now: createdAt + TRANSACTION_LEASE_MS - 1, processKill: permissionDeniedKill })).toThrow(
      /in progress/i,
    );
    expect(existsSync(transactionPath)).toBe(true);
  });

  it("recovers an old marker even when its pid is still active", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");
    const transactionPath = join(rootDir, "static-versions", ".archive-v1.2.3.txn");
    const releaseHtml = "<html>release 1.2.3</html>\n";
    const createdAt = Date.now() - TRANSACTION_LEASE_MS - 1;

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), releaseHtml, "utf8");
    mkdirSync(join(archivePath, ".."), { recursive: true });
    writeFileSync(archivePath, releaseHtml, "utf8");
    writeJson(transactionPath, {
      transactionId: "old-active-pid-transaction",
      pid: process.pid,
      createdAt,
      version: "1.2.3",
    });

    archiveStaticVersion({ rootDir, now: Date.now() });

    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual({
      latestStable: "1.2.3",
      versions: ["1.2.3", "1.2.2"],
    });
    expect(existsSync(transactionPath)).toBe(false);
  });

  it("cleans the temporary marker after a partial marker write fails", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const markerPrefix = ".archive-v1.2.3.txn.";

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    const beforeManifest = readFileSync(manifestPath, "utf8");
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");

    let markerFd;
    const failingFs = {
      ...nodeFs,
      openSync(path, flags) {
        const fd = nodeFs.openSync(path, flags);
        if (path.includes(markerPrefix) && path.endsWith(".tmp")) {
          markerFd = fd;
        }
        return fd;
      },
      writeSync(fd, buffer, offset, length, position) {
        if (fd === markerFd) {
          nodeFs.writeSync(fd, buffer, offset, Math.min(4, length), position);
          const error = new Error("marker write failed with ENOSPC");
          error.code = "ENOSPC";
          throw error;
        }
        return nodeFs.writeSync(fd, buffer, offset, length, position);
      },
    };

    expect(() => archiveStaticVersion({ rootDir, fs: failingFs })).toThrow(/ENOSPC/);
    expect(existsSync(join(rootDir, "static-versions", ".archive-v1.2.3.txn"))).toBe(false);
    expect(readdirSync(join(rootDir, "static-versions")).filter((entry) => entry.startsWith(markerPrefix))).toEqual([]);
    expect(readFileSync(manifestPath, "utf8")).toBe(beforeManifest);
  });

  it("does not remove a competing transaction marker when marker publication loses a race", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const transactionPath = join(rootDir, "static-versions", ".archive-v1.2.3.txn");
    const competitorMarker = {
      transactionId: "competitor-transaction",
      pid: process.pid,
      createdAt: Date.now(),
      version: "1.2.3",
    };

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");

    const losingMarkerFs = {
      ...nodeFs,
      linkSync(source, destination) {
        if (destination === transactionPath) {
          writeJson(destination, competitorMarker);
          const error = new Error("marker creation lost the race");
          error.code = "EEXIST";
          throw error;
        }

        return nodeFs.linkSync(source, destination);
      },
    };

    expect(() => archiveStaticVersion({ rootDir, fs: losingMarkerFs })).toThrow(/marker creation lost the race/);
    expect(JSON.parse(readFileSync(transactionPath, "utf8"))).toEqual(competitorMarker);
    expect(readdirSync(join(rootDir, "static-versions")).some((entry) => entry.startsWith(".archive-v1.2.3.txn."))).toBe(false);
  });

  it("serializes different version archives and preserves both manifest updates after retry", () => {
    const rootDir = createTempRoot();
    const packagePath = join(rootDir, "package.json");
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const firstArchivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");
    const secondVersionArchiveFragment = `${join("v1.2.4", "index.html")}.`;
    const firstNow = 1_000;
    let secondRan = false;

    writeJson(packagePath, { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");

    const firstFs = {
      ...nodeFs,
      linkSync(source, destination) {
        if (!secondRan && destination === firstArchivePath) {
          secondRan = true;
          archiveStaticVersion({
            rootDir,
            now: firstNow + TRANSACTION_LEASE_MS + 1,
            fs: {
              ...nodeFs,
              readFileSync(path, encoding) {
                if (path === packagePath) {
                  return JSON.stringify({ version: "1.2.4" });
                }

                return nodeFs.readFileSync(path, encoding);
              },
              copyFileSync(sourcePath, destinationPath) {
                if (destinationPath.includes(secondVersionArchiveFragment)) {
                  nodeFs.writeFileSync(destinationPath, "<html>release 1.2.4</html>\n", "utf8");
                  return;
                }

                return nodeFs.copyFileSync(sourcePath, destinationPath);
              },
            },
          });
        }

        return nodeFs.linkSync(source, destination);
      },
    };

    expect(() => archiveStaticVersion({ rootDir, now: firstNow, fs: firstFs })).toThrow(/ownership lost/i);
    expect(() => archiveStaticVersion({ rootDir, now: firstNow + (2 * TRANSACTION_LEASE_MS) })).not.toThrow();
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual({
      latestStable: "1.2.3",
      versions: ["1.2.4", "1.2.3", "1.2.2"],
    });
  });

  it("does not let an old owner roll back a recovered archive or manifest", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");
    const lockPath = join(rootDir, "static-versions", ".archive-static.lock");
    const oldNow = 2_000;
    let recoveryRan = false;

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");

    const oldOwnerFs = {
      ...nodeFs,
      renameSync(source, destination) {
        if (!recoveryRan && destination === manifestPath) {
          recoveryRan = true;
          archiveStaticVersion({ rootDir, now: oldNow + TRANSACTION_LEASE_MS + 1 });
          throw new Error("old manifest rename failed after recovery");
        }

        return nodeFs.renameSync(source, destination);
      },
    };

    expect(() => archiveStaticVersion({ rootDir, now: oldNow, fs: oldOwnerFs })).toThrow(/ownership lost/i);
    expect(readFileSync(archivePath, "utf8")).toBe("<html>release 1.2.3</html>\n");
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual({
      latestStable: "1.2.3",
      versions: ["1.2.3", "1.2.2"],
    });
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(join(rootDir, "static-versions", ".archive-v1.2.3.txn"))).toBe(false);
  });

  it("rolls back the archive and temporary manifest when manifest replacement fails", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");
    const beforeManifest = readFileSync(manifestPath, "utf8");
    const failingFs = {
      ...nodeFs,
      renameSync() {
        throw new Error("manifest replacement failed");
      },
    };

    expect(() => archiveStaticVersion({ rootDir, fs: failingFs })).toThrow(/manifest replacement failed/);
    expect(existsSync(archivePath)).toBe(false);
    expect(existsSync(join(rootDir, "static-versions", "versions", "v1.2.3"))).toBe(false);
    expect(readdirSync(join(rootDir, "static-versions")).filter((entry) => entry.includes(".tmp")).length).toBe(0);
    expect(readFileSync(manifestPath, "utf8")).toBe(beforeManifest);
  });

  it("cleans a partially copied temporary archive after ENOSPC", () => {
    const rootDir = createTempRoot();
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");
    const archiveDir = join(rootDir, "static-versions", "versions", "v1.2.3");

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(manifestPath, { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");
    const beforeManifest = readFileSync(manifestPath, "utf8");
    const failingFs = {
      ...nodeFs,
      copyFileSync(source, destination, flags) {
        if (destination.endsWith(".tmp")) {
          nodeFs.mkdirSync(join(destination, ".."), { recursive: true });
          nodeFs.writeFileSync(destination, "partial archive");
          const error = new Error("copy failed with ENOSPC");
          error.code = "ENOSPC";
          throw error;
        }

        return nodeFs.copyFileSync(source, destination, flags);
      },
    };

    expect(() => archiveStaticVersion({ rootDir, fs: failingFs })).toThrow(/ENOSPC/);
    expect(existsSync(archivePath)).toBe(false);
    expect(existsSync(archiveDir)).toBe(false);
    expect(readFileSync(manifestPath, "utf8")).toBe(beforeManifest);
  });

  it("creates a new archive with an exclusive file operation", () => {
    const rootDir = createTempRoot();
    let copyFlags;

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(join(rootDir, "static-versions", "manifest.json"), { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");

    archiveStaticVersion({
      rootDir,
      fs: {
        ...nodeFs,
        copyFileSync(source, destination, flags) {
          copyFlags = flags;
          return nodeFs.copyFileSync(source, destination, flags);
        },
      },
    });

    expect(copyFlags & constants.COPYFILE_EXCL).toBe(constants.COPYFILE_EXCL);
  });

  it("does not remove a competing archive when exclusive creation loses a race", () => {
    const rootDir = createTempRoot();
    const archivePath = join(rootDir, "static-versions", "versions", "v1.2.3", "index.html");

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(join(rootDir, "static-versions", "manifest.json"), { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "<html>release 1.2.3</html>\n", "utf8");

    const losingFs = {
      ...nodeFs,
      linkSync(source, destination) {
        if (!destination.endsWith(`${join("v1.2.3", "index.html")}`)) {
          return nodeFs.linkSync(source, destination);
        }

        nodeFs.copyFileSync(source, destination);
        const error = new Error("archive creation lost the race");
        error.code = "EEXIST";
        throw error;
      },
    };

    expect(() => archiveStaticVersion({ rootDir, fs: losingFs })).toThrow(/lost the race/);
    expect(readFileSync(archivePath, "utf8")).toBe("<html>release 1.2.3</html>\n");
  });

  it("orders numeric prerelease identifiers with SemVer rules", () => {
    expect(
      validateVersionManifest({
        latestStable: "1.0.0",
        versions: ["1.0.0", "1.0.0-alpha.10", "1.0.0-alpha.2"],
      }),
    ).toEqual({ latestStable: "1.0.0", versions: ["1.0.0", "1.0.0-alpha.10", "1.0.0-alpha.2"] });
  });

  it("rejects versions that are not valid SemVer", () => {
    expect(() => validateVersionManifest({ latestStable: "1.0.0", versions: ["1.0.0", "1.0.0-alpha..1"] })).toThrow(
      /invalid.*semver/i,
    );
  });

  it("does not treat a dist-static-evil path as an in-bounds asset", () => {
    const rootDir = createTempRoot();
    const distDir = join(rootDir, "dist-static");
    const evilPath = join(rootDir, "dist-static-evil", "icon.svg");

    writeJson(join(rootDir, "static-versions", "manifest.json"), { latestStable: "1.2.2", versions: ["1.2.2"] });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    mkdirSync(distDir, { recursive: true });
    mkdirSync(join(evilPath, ".."), { recursive: true });
    writeFileSync(evilPath, "<svg></svg>", "utf8");
    writeFileSync(join(distDir, "index.static.html"), '<link rel="icon" href="../dist-static-evil/icon.svg">', "utf8");

    expect(() => inlineStaticHtml({ rootDir, distDir })).toThrow(/outside dist-static/i);
  });

  it("runs the complete inline flow without creating or changing the current source archive", () => {
    const rootDir = createTempRoot();
    const distDir = join(rootDir, "dist-static");
    const priorArchivePath = writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");

    writeJson(join(rootDir, "package.json"), { version: "1.2.3" });
    writeJson(join(rootDir, "static-versions", "manifest.json"), { latestStable: "1.2.2", versions: ["1.2.2"] });
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, "index.static.html"), "<!doctype html><html><body>latest</body></html>\n", "utf8");
    const beforeHash = sha256(priorArchivePath);

    inlineStaticHtml({ rootDir, distDir });

    expect(sha256(priorArchivePath)).toBe(beforeHash);
    expect(existsSync(join(rootDir, "static-versions", "versions", "v1.2.3", "index.html"))).toBe(false);
    expect(readFileSync(join(distDir, "index.html"), "utf8")).toBe(readFileSync(join(distDir, "gpt-image-2-studio-lite.html"), "utf8"));
  });

  it("keeps the site check from accepting mismatched archive bytes", () => {
    const fixture = createSiteFixture({ distContents: "<html>different</html>\n" });

    expect(() => runStaticSiteCheck(fixture)).toThrow(/byte-identical/);
  });

  it("rejects a source archive whose embedded manifest does not include its own version", () => {
    const fixture = createSiteFixture({
      sourceContents: versionedArchiveHtml({ latestStable: "0.9.0", versions: ["0.9.0"] }),
    });
    writeFileSync(
      join(fixture.distDir, "versions", "v1.0.0", "index.html"),
      versionedArchiveHtml({ latestStable: "0.9.0", versions: ["0.9.0"] }),
      "utf8",
    );

    expect(() => runStaticSiteCheck(fixture)).toThrow(/embedded manifest.*1\.0\.0/i);
  });

  it("accepts a legacy non-latest archive that embeds its own package version", () => {
    const rootDir = createTempRoot();
    const distDir = join(rootDir, "dist-static");
    const manifest = { latestStable: "1.0.0", versions: ["1.0.0", "0.9.0"] };
    const currentArchive = versionedArchiveHtml(manifest);
    const legacyArchive = '<html><script>const packageJson={name:`chat-to-image`,version:`0.9.0`}</script></html>\n';
    const appHtml = '<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024"</script>';

    writeJson(join(rootDir, "static-versions", "manifest.json"), manifest);
    writeSourceArchive(rootDir, "1.0.0", currentArchive);
    writeSourceArchive(rootDir, "0.9.0", legacyArchive);
    writeJson(join(distDir, "versions", "manifest.json"), manifest);
    mkdirSync(join(distDir, "versions", "v1.0.0"), { recursive: true });
    mkdirSync(join(distDir, "versions", "v0.9.0"), { recursive: true });
    writeFileSync(join(distDir, "versions", "v1.0.0", "index.html"), currentArchive, "utf8");
    writeFileSync(join(distDir, "versions", "v0.9.0", "index.html"), legacyArchive, "utf8");
    writeFileSync(join(distDir, "index.html"), appHtml, "utf8");
    writeFileSync(join(distDir, "gpt-image-2-studio-lite.html"), appHtml, "utf8");

    expect(() => runStaticSiteCheck({ rootDir, distDir })).not.toThrow();
  });

  it("rejects a manifest that references a missing source archive", () => {
    const rootDir = createTempRoot();
    const distDir = join(rootDir, "dist-static");
    const manifest = { latestStable: "1.0.0", versions: ["1.0.0"] };
    const appHtml = '<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024"</script>';

    writeJson(join(rootDir, "static-versions", "manifest.json"), manifest);
    writeJson(join(distDir, "versions", "manifest.json"), manifest);
    writeFileSync(join(distDir, "index.html"), appHtml, "utf8");
    writeFileSync(join(distDir, "gpt-image-2-studio-lite.html"), appHtml, "utf8");

    expect(() => runStaticSiteCheck({ rootDir, distDir })).toThrow(/source.*manifest|manifest.*archive/i);
  });

  it("rejects latest and release HTML that are not identical", () => {
    const fixture = createSiteFixture();
    writeFileSync(join(fixture.distDir, "gpt-image-2-studio-lite.html"), "different", "utf8");

    expect(() => runStaticSiteCheck(fixture)).toThrow(/same inlined app/);
  });

  it.each([
    ['license:"MIT"', "package license metadata"],
    ["vitest run", "package scripts"],
    ["@tauri-apps/api", "tooling dependencies"],
  ])("rejects %s in top-level current-release HTML", (marker, label) => {
    const fixture = createSiteFixture();
    const leakingHtml = `<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024";${marker}</script>`;
    writeFileSync(join(fixture.distDir, "index.html"), leakingHtml, "utf8");
    writeFileSync(join(fixture.distDir, "gpt-image-2-studio-lite.html"), leakingHtml, "utf8");

    expect(() => runStaticSiteCheck(fixture)).toThrow(new RegExp(label, "i"));
  });

  it("does not scan immutable historical archive contents for package markers", () => {
    const fixture = createSiteFixture({
      sourceContents:
        '<html><script>const manifest={latestStable:`1.0.0`,versions:[`1.0.0`]};license:"ISC";vitest run;@tauri-apps/api</script></html>\n',
    });

    expect(() => runStaticSiteCheck(fixture)).not.toThrow();
  });

  it("rejects an unexpected dist archive", () => {
    const fixture = createSiteFixture();
    mkdirSync(join(fixture.distDir, "versions", "v2.0.0"), { recursive: true });
    writeFileSync(join(fixture.distDir, "versions", "v2.0.0", "index.html"), "<html>extra</html>\n", "utf8");

    expect(() => runStaticSiteCheck(fixture)).toThrow(/Dist archives do not match/);
  });

  it("treats a missing argv[1] as an import, not direct execution", () => {
    expect(isDirectExecution(import.meta.url, undefined)).toBe(false);
  });

  it("copies immutable source archives without mutating them during normal build logic", () => {
    const rootDir = createTempRoot();
    const sourceArchivePath = join(rootDir, "static-versions", "versions", "v0.1.4", "index.html");

    writeJson(join(rootDir, "static-versions", "manifest.json"), {
      latestStable: "0.1.4",
      versions: ["0.1.4"],
    });
    mkdirSync(join(sourceArchivePath, ".."), { recursive: true });
    writeFileSync(sourceArchivePath, "<html>old archive</html>\n", "utf8");
    const beforeHash = sha256(sourceArchivePath);

    copyStaticArchives({ rootDir });

    expect(sha256(sourceArchivePath)).toBe(beforeHash);
    expect(readFileSync(join(rootDir, "dist-static", "versions", "v0.1.4", "index.html"), "utf8")).toBe(
      "<html>old archive</html>\n",
    );
  });

  it("requires every dist archive to be byte-identical to its source archive", () => {
    const rootDir = createTempRoot();
    const distDir = join(rootDir, "dist-static");
    const sourceArchivePath = join(rootDir, "static-versions", "versions", "v0.1.4", "index.html");
    const secondSourceArchivePath = join(rootDir, "static-versions", "versions", "v0.1.3", "index.html");

    writeJson(join(rootDir, "static-versions", "manifest.json"), {
      latestStable: "0.1.4",
      versions: ["0.1.4", "0.1.3"],
    });
    mkdirSync(join(sourceArchivePath, ".."), { recursive: true });
    mkdirSync(join(secondSourceArchivePath, ".."), { recursive: true });
    writeFileSync(sourceArchivePath, "<html>0.1.4</html>\n", "utf8");
    writeFileSync(secondSourceArchivePath, "<html>0.1.3</html>\n", "utf8");
    copyStaticArchives({ rootDir });

    expect(() => assertStaticVersionArchivesMatch({ rootDir, distDir })).not.toThrow();
    expect(readFileSync(join(distDir, "versions", "v0.1.4", "index.html"), "utf8")).toBe(
      readFileSync(sourceArchivePath, "utf8"),
    );
    expect(readFileSync(join(distDir, "versions", "v0.1.3", "index.html"), "utf8")).toBe(
      readFileSync(secondSourceArchivePath, "utf8"),
    );
  });
});
