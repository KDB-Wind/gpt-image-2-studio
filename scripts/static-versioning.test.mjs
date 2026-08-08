import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
import { constants, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
import { runReleaseArchiveParity } from "./release-archive-parity.mjs";
import { assertStaticVersionArchivesMatch, runStaticSiteCheck } from "./static-site-check.mjs";

function createTempRoot() {
  return mkdtempSync(join(tmpdir(), "chat-to-image-static-versioning-"));
}

function canCreateDirectoryLink() {
  const rootDir = createTempRoot();
  const targetDir = join(rootDir, "target");
  const linkDir = join(rootDir, "link");
  mkdirSync(targetDir);

  try {
    symlinkSync(targetDir, linkDir, process.platform === "win32" ? "junction" : "dir");
    return lstatSync(linkDir).isSymbolicLink();
  } catch {
    return false;
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

const directoryLinksSupported = canCreateDirectoryLink();

function writeJson(path, value) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function expectTrustedManifest(path, expected) {
  const actual = JSON.parse(readFileSync(path, "utf8"));
  expect(actual).toMatchObject(expected);
  for (const version of expected.versions) {
    expect(actual.sha256[version]).toMatch(/^[a-f0-9]{64}$/);
  }
}

function commitFixtureArchive(rootDir, version) {
  const archivePath = `static-versions/versions/v${version}/index.html`;
  for (const args of [
    ["init"],
    ["config", "core.autocrlf", "false"],
    ["config", "user.email", "release-test@example.invalid"],
    ["config", "user.name", "Release Test"],
    ["add", "--", "package.json", "static-versions/manifest.json", archivePath],
    ["commit", "-m", "fixture archive base"],
    ["commit", "--allow-empty", "-m", "fixture release head"],
  ]) {
    const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`Fixture git command failed: git ${args[0]}`);
    }
  }
}

function runFixtureGit(rootDir, args) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Fixture git command failed: git ${args.join(" ")}`);
  }
  return result.stdout.trim();
}

function writeSourceArchiveBytes(rootDir, version, bytes) {
  const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");
  mkdirSync(join(archivePath, ".."), { recursive: true });
  writeFileSync(archivePath, bytes);
  return archivePath;
}

function createHistoricalParityFixture({
  historicalBytes = Buffer.from(versionedArchiveHtml({ latestStable: "1.0.0", versions: ["1.0.0"] }), "utf8"),
} = {}) {
  const rootDir = createTempRoot();
  const distDir = join(rootDir, "dist-static");
  const currentBytes = Buffer.from(
    versionedArchiveHtml({ latestStable: "1.1.0", versions: ["1.1.0", "1.0.0"] }),
    "utf8",
  );

  writeJson(join(rootDir, "package.json"), { version: "1.0.0" });
  writeSourceArchiveBytes(rootDir, "1.0.0", historicalBytes);
  writeJson(join(rootDir, "static-versions", "manifest.json"), {
    latestStable: "1.0.0",
    versions: ["1.0.0"],
  });
  runFixtureGit(rootDir, ["init"]);
  runFixtureGit(rootDir, ["config", "core.autocrlf", "false"]);
  runFixtureGit(rootDir, ["config", "user.email", "release-test@example.invalid"]);
  runFixtureGit(rootDir, ["config", "user.name", "Release Test"]);
  runFixtureGit(rootDir, ["add", "."]);
  runFixtureGit(rootDir, ["commit", "-m", "historical base"]);
  const baseRef = runFixtureGit(rootDir, ["rev-parse", "HEAD"]);

  writeJson(join(rootDir, "package.json"), { version: "1.1.0" });
  writeSourceArchiveBytes(rootDir, "1.1.0", currentBytes);
  const releaseManifest = {
    latestStable: "1.1.0",
    versions: ["1.1.0", "1.0.0"],
    sha256: {
      "1.1.0": createHash("sha256").update(currentBytes).digest("hex"),
      "1.0.0": createHash("sha256").update(historicalBytes).digest("hex"),
    },
  };
  writeJson(join(rootDir, "static-versions", "manifest.json"), releaseManifest);
  runFixtureGit(rootDir, ["add", "."]);
  runFixtureGit(rootDir, ["commit", "-m", "current release"]);

  writeJson(join(distDir, "versions", "manifest.json"), releaseManifest);
  const currentBuiltArchive = join(distDir, "versions", "v1.1.0", "index.html");
  const historicalBuiltArchive = join(distDir, "versions", "v1.0.0", "index.html");
  mkdirSync(join(currentBuiltArchive, ".."), { recursive: true });
  mkdirSync(join(historicalBuiltArchive, ".."), { recursive: true });
  writeFileSync(currentBuiltArchive, currentBytes);
  writeFileSync(historicalBuiltArchive, historicalBytes);
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), currentBytes);
  writeFileSync(join(distDir, "gpt-image-2-studio-lite.html"), currentBytes);

  return { rootDir, distDir, baseRef, currentBytes, historicalBytes, releaseManifest };
}

function parityCliEnvironment(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.STATIC_ARCHIVE_BASE_REF;
  delete env.STATIC_ARCHIVE_EVENT_BASE_REF;
  if (!("STATIC_ARCHIVE_TRUSTED_BASE" in overrides)) {
    delete env.STATIC_ARCHIVE_TRUSTED_BASE;
  }
  return env;
}

function createAnchoredLatestMutationFixture() {
  const rootDir = createTempRoot();
  const distDir = join(rootDir, "dist-static");
  const version = "1.0.0";
  const baseBytes = Buffer.from(versionedArchiveHtml({ latestStable: version, versions: [version] }), "utf8");
  const changedBytes = Buffer.concat([baseBytes, Buffer.from("<!-- mutated anchored latest -->\n", "utf8")]);

  writeJson(join(rootDir, "package.json"), { version });
  writeSourceArchiveBytes(rootDir, version, baseBytes);
  writeJson(join(rootDir, "static-versions", "manifest.json"), {
    latestStable: version,
    versions: [version],
    sha256: { [version]: createHash("sha256").update(baseBytes).digest("hex") },
  });
  runFixtureGit(rootDir, ["init"]);
  runFixtureGit(rootDir, ["config", "core.autocrlf", "false"]);
  runFixtureGit(rootDir, ["config", "user.email", "release-test@example.invalid"]);
  runFixtureGit(rootDir, ["config", "user.name", "Release Test"]);
  runFixtureGit(rootDir, ["add", "."]);
  runFixtureGit(rootDir, ["commit", "-m", "trusted latest stable"]);
  const anchorRef = runFixtureGit(rootDir, ["rev-parse", "HEAD"]);

  const currentManifest = {
    latestStable: version,
    versions: [version],
    sha256: { [version]: createHash("sha256").update(changedBytes).digest("hex") },
  };
  writeSourceArchiveBytes(rootDir, version, changedBytes);
  writeJson(join(rootDir, "static-versions", "manifest.json"), currentManifest);
  writeJson(join(distDir, "versions", "manifest.json"), currentManifest);
  writeFixtureArchive(distDir, version, changedBytes);
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), changedBytes);
  writeFileSync(join(distDir, "gpt-image-2-studio-lite.html"), changedBytes);
  runFixtureGit(rootDir, ["add", "."]);
  runFixtureGit(rootDir, ["commit", "-m", "mutate trusted latest stable"]);

  return { rootDir, distDir, anchorRef };
}

function replaceHistoricalArchiveAndCommit(fixture, bytes, message) {
  writeSourceArchiveBytes(fixture.rootDir, "1.0.0", bytes);
  const builtArchivePath = join(fixture.distDir, "versions", "v1.0.0", "index.html");
  mkdirSync(join(builtArchivePath, ".."), { recursive: true });
  writeFileSync(builtArchivePath, bytes);
  fixture.releaseManifest.sha256["1.0.0"] = createHash("sha256").update(bytes).digest("hex");
  writeJson(join(fixture.rootDir, "static-versions", "manifest.json"), fixture.releaseManifest);
  writeJson(join(fixture.distDir, "versions", "manifest.json"), fixture.releaseManifest);
  runFixtureGit(fixture.rootDir, ["add", "static-versions"]);
  runFixtureGit(fixture.rootDir, ["commit", "-m", message]);
}

function replaceCurrentArchiveAndCommit(fixture, bytes, message) {
  writeSourceArchiveBytes(fixture.rootDir, "1.1.0", bytes);
  writeFileSync(join(fixture.distDir, "versions", "v1.1.0", "index.html"), bytes);
  writeFileSync(join(fixture.distDir, "index.html"), bytes);
  writeFileSync(join(fixture.distDir, "gpt-image-2-studio-lite.html"), bytes);
  fixture.releaseManifest.sha256["1.1.0"] = createHash("sha256").update(bytes).digest("hex");
  writeJson(join(fixture.rootDir, "static-versions", "manifest.json"), fixture.releaseManifest);
  writeJson(join(fixture.distDir, "versions", "manifest.json"), fixture.releaseManifest);
  runFixtureGit(fixture.rootDir, ["add", "static-versions"]);
  runFixtureGit(fixture.rootDir, ["commit", "-m", message]);
}

function writeSourceArchive(rootDir, version, contents) {
  const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");
  mkdirSync(join(archivePath, ".."), { recursive: true });
  writeFileSync(archivePath, contents, "utf8");
  return archivePath;
}

function writeFixtureArchive(distDir, version, contents) {
  const archivePath = join(distDir, "versions", `v${version}`, "index.html");
  mkdirSync(join(archivePath, ".."), { recursive: true });
  writeFileSync(archivePath, contents, "utf8");
  return archivePath;
}

function versionedArchiveHtml({ latestStable, versions }) {
  const quotedVersions = versions.map((version) => `\`${version}\``).join(",");
  return `<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024";const manifest={latestStable:\`${latestStable}\`,versions:[${quotedVersions}]}</script>\n`;
}

function createSiteFixture({
  sourceContents = versionedArchiveHtml({ latestStable: "1.0.0", versions: ["1.0.0"] }),
  distContents = sourceContents,
  packageVersion = "1.0.0",
  appContents,
} = {}) {
  const rootDir = createTempRoot();
  const distDir = join(rootDir, "dist-static");
  const manifest = {
    latestStable: "1.0.0",
    versions: ["1.0.0"],
    sha256: { "1.0.0": createHash("sha256").update(sourceContents).digest("hex") },
  };
  const appHtml = appContents ?? sourceContents;

  writeJson(join(rootDir, "package.json"), { version: packageVersion });
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
  it("stores immutable release HTML without Git text normalization", () => {
    expect(existsSync(".gitattributes")).toBe(true);
    const attributes = readFileSync(".gitattributes", "utf8");

    expect(attributes).toMatch(/^\/static-versions\/versions\/\*\*\/index\.html binary$/m);
    expect(attributes).toMatch(/^\/dist-static\/versions\/\*\*\/index\.html binary$/m);
    expect(attributes).toMatch(/^\/dist-static\/index\.html -text$/m);
    expect(attributes).toMatch(/^\/dist-static\/gpt-image-2-studio-lite\.html -text$/m);
    expect(attributes).toMatch(/^\/src\/assets\/app-logo\.svg text eol=lf$/m);
  });

  it("produces identical inlined SVG bytes from LF and CRLF checkouts", () => {
    const buildFixture = (svg) => {
      const rootDir = createTempRoot();
      const distDir = join(rootDir, "dist-static");
      writeJson(join(rootDir, "static-versions", "manifest.json"), {
        latestStable: "1.0.0",
        versions: ["1.0.0"],
      });
      writeSourceArchive(rootDir, "1.0.0", "<html>archive</html>\n");
      mkdirSync(join(distDir, "assets"), { recursive: true });
      writeFileSync(
        join(distDir, "index.static.html"),
        '<!doctype html><html><head><link rel="icon" href="./assets/app-logo.svg"></head></html>\n',
        "utf8",
      );
      writeFileSync(join(distDir, "assets", "app-logo.svg"), svg, "utf8");
      inlineStaticHtml({ rootDir, distDir });
      return readFileSync(join(distDir, "index.html"));
    };

    const lfSvg = '<svg xmlns="http://www.w3.org/2000/svg">\n  <path d="M0 0"/>\n</svg>\n';
    const crlfSvg = lfSvg.replace(/\n/g, "\r\n");

    expect(buildFixture(crlfSvg)).toEqual(buildFixture(lfSvg));
  });

  it("normalizes doubled carriage returns without leaving trailing whitespace", () => {
    const rootDir = createTempRoot();
    const distDir = join(rootDir, "dist-static");
    writeJson(join(rootDir, "static-versions", "manifest.json"), {
      latestStable: "1.0.0",
      versions: ["1.0.0"],
    });
    writeSourceArchive(rootDir, "1.0.0", "<html>archive</html>\n");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, "index.static.html"), "<div>root</div>\r\r\n<span>next</span>\r\n", "utf8");

    inlineStaticHtml({ rootDir, distDir });

    const html = readFileSync(join(distDir, "index.html"), "utf8");
    expect(html).toBe("<div>root</div>\n\n<span>next</span>\n");
    expect(html).not.toMatch(/[ \t\r]+$/m);
  });

  it("keeps the body closing spacing stable across source line endings", () => {
    const rootDir = createTempRoot();
    const distDir = join(rootDir, "dist-static");
    writeJson(join(rootDir, "static-versions", "manifest.json"), {
      latestStable: "1.0.0",
      versions: ["1.0.0"],
    });
    writeSourceArchive(rootDir, "1.0.0", "<html>archive</html>\n");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      join(distDir, "index.static.html"),
      "<body>\r\n  <div id=\"root\"></div>\r\n  </body>\r\n",
      "utf8",
    );

    inlineStaticHtml({ rootDir, distDir });

    expect(readFileSync(join(distDir, "index.html"), "utf8")).toBe(
      "<body>\n  <div id=\"root\"></div>\n\n  </body>\n",
    );
  });

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
    expectTrustedManifest(manifestPath, nextManifest);
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
    expectTrustedManifest(join(rootDir, "static-versions", "manifest.json"), {
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
    expectTrustedManifest(manifestPath, {
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

  it("rejects non-prepared stale cleanup through a target archive junction", () => {
    const rootDir = createTempRoot();
    const outsideDir = createTempRoot();
    const version = "1.2.3";
    const manifestPath = join(rootDir, "static-versions", "manifest.json");
    const archiveDir = join(rootDir, "static-versions", "versions", `v${version}`);
    const archivePath = join(archiveDir, "index.html");
    const temporaryArchivePath = `${archivePath}.stale.tmp`;
    const temporaryManifestPath = `${manifestPath}.stale.tmp`;
    const transactionPath = join(rootDir, "static-versions", `.archive-v${version}.txn`);
    const outsideIndex = join(outsideDir, "index.html");
    const outsideTemp = join(outsideDir, "index.html.stale.tmp");
    const outsideSentinel = join(outsideDir, "sentinel.txt");

    writeJson(join(rootDir, "package.json"), { version });
    writeJson(manifestPath, { latestStable: version, versions: [version] });
    mkdirSync(join(archiveDir, ".."), { recursive: true });
    writeFileSync(outsideIndex, "external archive", "utf8");
    writeFileSync(outsideTemp, "external temporary archive", "utf8");
    writeFileSync(outsideSentinel, "external sentinel", "utf8");
    symlinkSync(outsideDir, archiveDir, process.platform === "win32" ? "junction" : "dir");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), "external archive", "utf8");
    writeJson(temporaryManifestPath, { latestStable: version, versions: [version] });
    writeJson(transactionPath, {
      transactionId: "junction-stale-transaction",
      pid: process.pid,
      createdAt: Date.now() - TRANSACTION_LEASE_MS - 1,
      version,
      temporaryArchivePath,
      temporaryManifestPath,
    });

    expect(() => archiveStaticVersion({ rootDir })).toThrow(/link|junction|reparse/i);
    expect(readFileSync(outsideIndex, "utf8")).toBe("external archive");
    expect(readFileSync(outsideTemp, "utf8")).toBe("external temporary archive");
    expect(readFileSync(outsideSentinel, "utf8")).toBe("external sentinel");
    expect(existsSync(transactionPath)).toBe(true);
  });

  it("rejects normal archive creation through an existing target junction", () => {
    const rootDir = createTempRoot();
    const outsideDir = createTempRoot();
    const version = "1.2.3";
    const archiveDir = join(rootDir, "static-versions", "versions", `v${version}`);
    const outsideSentinel = join(outsideDir, "sentinel.txt");

    writeJson(join(rootDir, "package.json"), { version });
    writeJson(join(rootDir, "static-versions", "manifest.json"), {
      latestStable: "1.2.2",
      versions: ["1.2.2"],
    });
    writeSourceArchive(rootDir, "1.2.2", "<html>release 1.2.2</html>\n");
    writeFileSync(outsideSentinel, "external sentinel", "utf8");
    symlinkSync(outsideDir, archiveDir, process.platform === "win32" ? "junction" : "dir");
    mkdirSync(join(rootDir, "dist-static"), { recursive: true });
    writeFileSync(
      join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"),
      "<html>release 1.2.3</html>\n",
      "utf8",
    );

    expect(() => archiveStaticVersion({ rootDir })).toThrow(/link|junction|reparse/i);
    expect(readFileSync(outsideSentinel, "utf8")).toBe("external sentinel");
    expect(readdirSync(outsideDir)).toEqual(["sentinel.txt"]);
    expect(existsSync(join(rootDir, "static-versions", `.archive-v${version}.txn`))).toBe(false);
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

    expectTrustedManifest(manifestPath, {
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
    expectTrustedManifest(manifestPath, {
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
    expectTrustedManifest(manifestPath, {
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

  it("rejects release-current HTML that differs from the immutable current-version archive", () => {
    const fixture = createSiteFixture({
      appContents: '<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024";different</script>',
    });

    expect(() => runStaticSiteCheck(fixture)).toThrow(/current release.*byte-identical/i);
  });

  it("allows development latest HTML to differ when package version is newer than latestStable", () => {
    const fixture = createSiteFixture({
      packageVersion: "1.0.1",
      appContents: '<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024";development</script>',
    });

    expect(() => runStaticSiteCheck(fixture)).not.toThrow();
  });

  it("keeps non-strict development checks permissive while strict release parity rejects a newer package", () => {
    const fixture = createSiteFixture({
      packageVersion: "1.0.1",
      appContents: '<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024";development</script>',
    });

    expect(() => runStaticSiteCheck(fixture)).not.toThrow();
    expect(() => runReleaseArchiveParity({
      ...fixture,
      strict: true,
      expectedTag: "v1.0.1",
      readHeadArchive: () => Buffer.from("unused"),
    })).toThrow(/package version.*latestStable/i);
  });

  it("strict release parity rejects a workflow tag that differs from the package version", () => {
    const fixture = createSiteFixture();

    expect(() => runReleaseArchiveParity({
      ...fixture,
      strict: true,
      expectedTag: "v1.0.1",
      readHeadArchive: () => readFileSync(
        join(fixture.rootDir, "static-versions", "versions", "v1.0.0", "index.html"),
      ),
    })).toThrow(/release tag.*package version/i);
  });

  it("strict release parity rejects a workflow version that differs from the package version", () => {
    const fixture = createSiteFixture();

    expect(() => runReleaseArchiveParity({
      ...fixture,
      strict: true,
      expectedTag: "v1.0.0",
      expectedVersion: "1.0.1",
      readHeadArchive: () => readFileSync(
        join(fixture.rootDir, "static-versions", "versions", "v1.0.0", "index.html"),
      ),
    })).toThrow(/release version.*package version/i);
  });

  it("strict release parity binds mutable working-tree release bytes to the tracked HEAD archive", () => {
    const fixture = createSiteFixture();
    const archivePath = join(fixture.rootDir, "static-versions", "versions", "v1.0.0", "index.html");
    commitFixtureArchive(fixture.rootDir, "1.0.0");
    const mutableArchive = versionedArchiveHtml({ latestStable: "1.0.0", versions: ["1.0.0"] }) + "<!-- mutable -->\n";

    writeFileSync(archivePath, mutableArchive, "utf8");
    writeFileSync(join(fixture.distDir, "versions", "v1.0.0", "index.html"), mutableArchive, "utf8");
    writeFileSync(join(fixture.distDir, "index.html"), mutableArchive, "utf8");
    writeFileSync(join(fixture.distDir, "gpt-image-2-studio-lite.html"), mutableArchive, "utf8");
    const manifestPath = join(fixture.rootDir, "static-versions", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sha256["1.0.0"] = createHash("sha256").update(mutableArchive).digest("hex");
    writeJson(manifestPath, manifest);
    writeJson(join(fixture.distDir, "versions", "manifest.json"), manifest);
    for (const args of [
      ["add", "--", "static-versions/manifest.json"],
      ["commit", "-m", "update current digest fixture"],
    ]) {
      const result = spawnSync("git", args, { cwd: fixture.rootDir, encoding: "utf8" });
      expect(result.status).toBe(0);
    }

    expect(() => runStaticSiteCheck(fixture)).not.toThrow();
    expect(() => runReleaseArchiveParity({
      ...fixture,
      strict: true,
      expectedTag: "v1.0.0",
    })).toThrow(/working-tree archive.*tracked HEAD archive/i);
  });

  it("strict release parity fails closed when git cannot provide a tracked HEAD archive", () => {
    const fixture = createSiteFixture();

    expect(() => runReleaseArchiveParity({
      ...fixture,
      strict: true,
      expectedTag: "v1.0.0",
    })).toThrow(/tracked Git blob|tracked HEAD/i);
  });

  it("strict release parity accepts a legacy base manifest by deriving its digest from raw Git blob bytes", () => {
    const fixture = createHistoricalParityFixture();

    expect(() => runReleaseArchiveParity({
      rootDir: fixture.rootDir,
      distDir: fixture.distDir,
      strict: true,
      expectedTag: "v1.1.0",
      baseRef: fixture.baseRef,
    })).not.toThrow();

    const baseBlob = runFixtureGit(fixture.rootDir, [
      "rev-parse",
      `${fixture.baseRef}:static-versions/versions/v1.0.0/index.html`,
    ]);
    const headBlob = runFixtureGit(fixture.rootDir, [
      "rev-parse",
      "HEAD:static-versions/versions/v1.0.0/index.html",
    ]);
    expect(headBlob).toBe(baseBlob);

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it.each(["--strict", "--historical-only"])(
    "direct %s parity fails closed without an external trusted base",
    (mode) => {
      const fixture = createHistoricalParityFixture();
      const parityScript = join(process.cwd(), "scripts", "release-archive-parity.mjs");
      const result = spawnSync(process.execPath, [parityScript, mode], {
        cwd: fixture.rootDir,
        encoding: "utf8",
        env: parityCliEnvironment(),
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/STATIC_ARCHIVE_TRUSTED_BASE.*required/i);

      rmSync(fixture.rootDir, { recursive: true, force: true });
    },
  );

  it.each(["--strict", "--historical-only"])(
    "direct %s parity accepts the external trusted base",
    (mode) => {
      const fixture = createHistoricalParityFixture();
      const parityScript = join(process.cwd(), "scripts", "release-archive-parity.mjs");
      const result = spawnSync(process.execPath, [parityScript, mode], {
        cwd: fixture.rootDir,
        encoding: "utf8",
        env: parityCliEnvironment({ STATIC_ARCHIVE_TRUSTED_BASE: fixture.baseRef }),
      });

      expect(result.status).toBe(0);

      rmSync(fixture.rootDir, { recursive: true, force: true });
    },
  );

  it("strict release parity rejects historical archive and digest changes across commits", () => {
    const fixture = createHistoricalParityFixture();
    const changedBytes = Buffer.concat([
      fixture.historicalBytes,
      Buffer.from("<!-- changed historical bytes -->\n", "utf8"),
    ]);
    replaceHistoricalArchiveAndCommit(fixture, changedBytes, "mutate historical archive and digest");

    expect(() => runReleaseArchiveParity({
      rootDir: fixture.rootDir,
      distDir: fixture.distDir,
      strict: true,
      expectedTag: "v1.1.0",
      baseRef: fixture.baseRef,
    })).toThrow(/historical archive (?:digest metadata|blob|bytes) changed/i);

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it("strict release parity compares the trusted anchor latestStable archive", () => {
    const fixture = createAnchoredLatestMutationFixture();

    expect(() => runReleaseArchiveParity({
      rootDir: fixture.rootDir,
      distDir: fixture.distDir,
      strict: true,
      expectedTag: "v1.0.0",
      baseRef: fixture.anchorRef,
    })).toThrow(/historical archive (?:digest metadata|blob|bytes) changed/i);

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it("strict release parity catches a trusted archive mutation introduced two commits before HEAD", () => {
    const fixture = createHistoricalParityFixture();
    const changedBytes = Buffer.concat([
      fixture.historicalBytes,
      Buffer.from("<!-- mutation hidden behind later commit -->\n", "utf8"),
    ]);
    replaceHistoricalArchiveAndCommit(fixture, changedBytes, "mutate trusted archive");
    runFixtureGit(fixture.rootDir, ["commit", "--allow-empty", "-m", "later unrelated commit"]);

    expect(() => runReleaseArchiveParity({
      rootDir: fixture.rootDir,
      distDir: fixture.distDir,
      strict: true,
      expectedTag: "v1.1.0",
      baseRef: fixture.baseRef,
    })).toThrow(/historical archive (?:digest metadata|blob|bytes) changed/i);

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it("a legacy newer base environment value cannot replace the external trust root", () => {
    const fixture = createHistoricalParityFixture();
    const changedBytes = Buffer.concat([
      fixture.historicalBytes,
      Buffer.from("<!-- newer bypass mutation -->\n", "utf8"),
    ]);
    replaceHistoricalArchiveAndCommit(fixture, changedBytes, "mutate trusted archive");
    runFixtureGit(fixture.rootDir, ["commit", "--allow-empty", "-m", "later unrelated commit"]);
    const newerBypassRef = runFixtureGit(fixture.rootDir, ["rev-parse", "HEAD^"]);

    const parityScript = join(process.cwd(), "scripts", "release-archive-parity.mjs");
    const result = spawnSync(process.execPath, [parityScript, "--historical-only"], {
      cwd: fixture.rootDir,
      encoding: "utf8",
      env: parityCliEnvironment({
        STATIC_ARCHIVE_TRUSTED_BASE: fixture.baseRef,
        STATIC_ARCHIVE_BASE_REF: newerBypassRef,
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/historical archive (?:digest metadata|blob|bytes) changed/i);

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it("strict release parity allows a version absent from the trusted anchor", () => {
    const fixture = createHistoricalParityFixture();

    expect(() => runReleaseArchiveParity({
      rootDir: fixture.rootDir,
      distDir: fixture.distDir,
      strict: true,
      expectedTag: "v1.1.0",
      baseRef: fixture.baseRef,
    })).not.toThrow();

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it("event-base parity protects versions introduced after the trusted anchor", () => {
    const fixture = createHistoricalParityFixture();
    const eventBaseRef = runFixtureGit(fixture.rootDir, ["rev-parse", "HEAD"]);
    const changedBytes = Buffer.concat([
      fixture.currentBytes,
      Buffer.from("<!-- mutate release after event base -->\n", "utf8"),
    ]);
    replaceCurrentArchiveAndCommit(fixture, changedBytes, "mutate post-anchor release");

    expect(() => runReleaseArchiveParity({
      rootDir: fixture.rootDir,
      distDir: fixture.distDir,
      strict: true,
      expectedTag: "v1.1.0",
      baseRef: fixture.baseRef,
      eventBaseRef,
    })).toThrow(/historical archive (?:digest metadata|blob|bytes) changed/i);

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it("strict release parity never normalizes historical archive bytes", () => {
    const crlfBytes = Buffer.from(
      versionedArchiveHtml({ latestStable: "1.0.0", versions: ["1.0.0"] }).replace(/\n/g, "\r\n"),
      "utf8",
    );
    const fixture = createHistoricalParityFixture({ historicalBytes: crlfBytes });
    const lfBytes = Buffer.from(crlfBytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    replaceHistoricalArchiveAndCommit(fixture, lfBytes, "normalize historical archive bytes");

    expect(() => runReleaseArchiveParity({
      rootDir: fixture.rootDir,
      distDir: fixture.distDir,
      strict: true,
      expectedTag: "v1.1.0",
      baseRef: fixture.baseRef,
    })).toThrow(/historical archive (?:digest metadata|blob|bytes) changed/i);

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it("strict release parity rejects a trusted base that is not a full commit SHA", () => {
    const fixture = createSiteFixture();
    commitFixtureArchive(fixture.rootDir, "1.0.0");

    expect(() => runReleaseArchiveParity({
      ...fixture,
      strict: true,
      expectedTag: "v1.0.0",
      baseRef: "refs/heads/does-not-exist",
    })).toThrow(/full 40-character commit SHA/i);
  });

  it("strict release parity fails closed when a full trusted base SHA is missing", () => {
    const fixture = createSiteFixture();
    commitFixtureArchive(fixture.rootDir, "1.0.0");

    expect(() => runReleaseArchiveParity({
      ...fixture,
      strict: true,
      expectedTag: "v1.0.0",
      baseRef: "f".repeat(40),
    })).toThrow(/base ref could not be resolved/i);
  });

  it("historical-only parity enforces the base gate without requiring strict current-release bytes", () => {
    const fixture = createHistoricalParityFixture();
    writeFileSync(join(fixture.distDir, "index.html"), "development pages output", "utf8");
    writeFileSync(join(fixture.distDir, "gpt-image-2-studio-lite.html"), "development pages output", "utf8");

    expect(() => runReleaseArchiveParity({
      rootDir: fixture.rootDir,
      distDir: fixture.distDir,
      historicalOnly: true,
      baseRef: fixture.baseRef,
    })).not.toThrow();

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it("external trust root rejects a mutation hidden behind a later in-repository anchor change", () => {
    const fixture = createHistoricalParityFixture();
    const changedBytes = Buffer.concat([
      fixture.historicalBytes,
      Buffer.from("<!-- reviewer bypass mutation -->\n", "utf8"),
    ]);
    replaceHistoricalArchiveAndCommit(fixture, changedBytes, "mutate archive and digest");
    const newerBypassRef = runFixtureGit(fixture.rootDir, ["rev-parse", "HEAD"]);
    writeJson(join(fixture.rootDir, "static-versions", "release-config.json"), {
      trustedArchiveBase: newerBypassRef,
    });
    runFixtureGit(fixture.rootDir, ["add", "static-versions/release-config.json"]);
    runFixtureGit(fixture.rootDir, ["commit", "-m", "move in-repository anchor past mutation"]);

    const parityScript = join(process.cwd(), "scripts", "release-archive-parity.mjs");
    const result = spawnSync(process.execPath, [parityScript, "--historical-only"], {
      cwd: fixture.rootDir,
      encoding: "utf8",
      env: parityCliEnvironment({
        STATIC_ARCHIVE_TRUSTED_BASE: fixture.baseRef,
        STATIC_ARCHIVE_BASE_REF: newerBypassRef,
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/historical archive (?:digest metadata|blob|bytes) changed/i);

    rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  it.skipIf(!directoryLinksSupported)(
    "strict release parity rejects archive link traversal (skipped only when directory links are unavailable)",
    () => {
    const fixture = createSiteFixture();
    const outsideRoot = createTempRoot();
    const archiveDirectory = join(fixture.rootDir, "static-versions", "versions", "v1.0.0");
    const archiveBytes = readFileSync(join(archiveDirectory, "index.html"));
    commitFixtureArchive(fixture.rootDir, "1.0.0");
    writeFileSync(join(outsideRoot, "index.html"), archiveBytes);
    rmSync(archiveDirectory, { recursive: true, force: true });
    symlinkSync(outsideRoot, archiveDirectory, process.platform === "win32" ? "junction" : "dir");

    expect(() => runReleaseArchiveParity({
      ...fixture,
      strict: true,
      expectedTag: "v1.0.0",
    })).toThrow(/link|reparse|safe release path/i);
    },
  );

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
    const publicManifest = { latestStable: "1.0.0", versions: ["1.0.0", "0.9.0"] };
    const currentArchive = versionedArchiveHtml(publicManifest);
    const legacyArchive = '<html><script>const packageJson={name:`chat-to-image`,version:`0.9.0`}</script></html>\n';
    const manifest = {
      ...publicManifest,
      sha256: {
        "1.0.0": createHash("sha256").update(currentArchive).digest("hex"),
        "0.9.0": createHash("sha256").update(legacyArchive).digest("hex"),
      },
    };
    const appHtml = '<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024"</script>';

    writeJson(join(rootDir, "package.json"), { version: "1.0.1" });
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
    const manifest = {
      latestStable: "1.0.0",
      versions: ["1.0.0"],
      sha256: { "1.0.0": "0".repeat(64) },
    };
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
    ["save_generated_image", "native bridge commands"],
    ["__TAURI_INTERNALS__", "native bridge detection"],
  ])("rejects %s in top-level current-release HTML", (marker, label) => {
    const fixture = createSiteFixture();
    const leakingHtml = `<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024";${marker}</script>`;
    writeFileSync(join(fixture.distDir, "index.html"), leakingHtml, "utf8");
    writeFileSync(join(fixture.distDir, "gpt-image-2-studio-lite.html"), leakingHtml, "utf8");

    expect(() => runStaticSiteCheck(fixture)).toThrow(new RegExp(label, "i"));
  });

  it("does not scan immutable historical archive contents for package markers", () => {
    const fixture = createSiteFixture({
      packageVersion: "1.0.1",
      sourceContents:
        '<html><script>const manifest={latestStable:`1.0.0`,versions:[`1.0.0`]};license:"ISC";vitest run;@tauri-apps/api</script></html>\n',
      appContents:
        '<!doctype html><link rel="icon" href="data:image/svg+xml,test"><script>viewBox:"0 0 1024 1024";development</script>',
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
