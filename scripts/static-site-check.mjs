import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  extractEmbeddedVersionManifest,
  isDirectExecution,
  validateVersionManifest,
} from "./archive-static-version.mjs";

const defaultRootDir = resolve(".");

function listArchiveVersions(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "index.html")))
    .map((entry) => entry.name.replace(/^v/, ""))
    .sort();
}

function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    throw new Error(`Static version manifest is missing: ${manifestPath}`);
  }

  return validateVersionManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
}

function assertSameVersionSet(label, actual, expected) {
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} archives do not match the manifest. Expected: ${expected.join(", ")}; found: ${actual.join(", ")}.`);
  }
}

function extractLegacyEmbeddedPackageVersion(html) {
  return html.match(
    /\bname\s*:\s*([`'"])chat-to-image\1\s*,\s*version\s*:\s*([`'"])([^`'"]+)\2/,
  )?.[3];
}

export function assertStaticVersionArchivesMatch({ rootDir = defaultRootDir, distDir = join(rootDir, "dist-static") } = {}) {
  const sourceVersionsDir = join(rootDir, "static-versions", "versions");
  const distVersionsDir = join(distDir, "versions");
  const sourceVersions = listArchiveVersions(sourceVersionsDir);
  const distVersions = listArchiveVersions(distVersionsDir);

  assertSameVersionSet("Dist", distVersions, sourceVersions);

  for (const version of sourceVersions) {
    const sourcePath = join(sourceVersionsDir, `v${version}`, "index.html");
    const distPath = join(distVersionsDir, `v${version}`, "index.html");

    if (readFileSync(distPath).compare(readFileSync(sourcePath)) !== 0) {
      throw new Error(`dist-static/versions/v${version}/index.html must be byte-identical to its source archive.`);
    }
  }
}

export function assertVersionManifestAndArchives({ rootDir = defaultRootDir, distDir = join(rootDir, "dist-static") } = {}) {
  const sourceManifest = readManifest(join(rootDir, "static-versions", "manifest.json"));
  const distManifest = readManifest(join(distDir, "versions", "manifest.json"));

  if (JSON.stringify(sourceManifest) !== JSON.stringify(distManifest)) {
    throw new Error("dist-static/versions/manifest.json must match static-versions/manifest.json.");
  }

  const expectedVersions = sourceManifest.versions;
  assertSameVersionSet("Source", listArchiveVersions(join(rootDir, "static-versions", "versions")), expectedVersions);
  assertSameVersionSet("Dist", listArchiveVersions(join(distDir, "versions")), expectedVersions);

  for (const version of expectedVersions) {
    const archivePath = join(rootDir, "static-versions", "versions", `v${version}`, "index.html");
    const archiveHtml = readFileSync(archivePath, "utf8");
    let embeddedManifest;

    try {
      embeddedManifest = extractEmbeddedVersionManifest(archiveHtml);
    } catch (error) {
      if (version === sourceManifest.latestStable) {
        throw error;
      }

      if (extractLegacyEmbeddedPackageVersion(archiveHtml) !== version) {
        throw new Error(`Legacy source archive v${version} must embed its own package version.`);
      }

      continue;
    }

    if (!embeddedManifest.versions.includes(version)) {
      throw new Error(`Source archive embedded manifest for v${version} must include its own version.`);
    }

    if (version === sourceManifest.latestStable && embeddedManifest.latestStable !== version) {
      throw new Error(`Latest source archive v${version} embedded manifest must identify itself as latestStable.`);
    }
  }

  assertStaticVersionArchivesMatch({ rootDir, distDir });
  return sourceManifest;
}

export function assertCurrentReleaseMatchesArchive({
  rootDir = defaultRootDir,
  distDir = join(rootDir, "dist-static"),
  manifest = readManifest(join(rootDir, "static-versions", "manifest.json")),
} = {}) {
  const packagePath = join(rootDir, "package.json");
  const packageVersion = JSON.parse(readFileSync(packagePath, "utf8"))?.version;
  if (packageVersion !== manifest.latestStable) {
    return;
  }

  const archiveBytes = readFileSync(
    join(rootDir, "static-versions", "versions", `v${packageVersion}`, "index.html"),
  );
  for (const fileName of ["index.html", "gpt-image-2-studio-lite.html"]) {
    if (readFileSync(join(distDir, fileName)).compare(archiveBytes) !== 0) {
      throw new Error(
        `Current release ${fileName} must be byte-identical to static-versions/versions/v${packageVersion}/index.html.`,
      );
    }
  }
}

function assertRequiredFiles(distDir) {
  const requiredFiles = ["index.html", "gpt-image-2-studio-lite.html", join("versions", "manifest.json")];
  const missing = requiredFiles.filter((file) => !existsSync(join(distDir, file)));

  if (missing.length > 0) {
    throw new Error(`Static site output is missing: ${missing.join(", ")}`);
  }
}

function assertSingleFileParity(distDir) {
  const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");
  const liteHtml = readFileSync(join(distDir, "gpt-image-2-studio-lite.html"), "utf8");

  if (indexHtml !== liteHtml) {
    throw new Error("dist-static/index.html and gpt-image-2-studio-lite.html must contain the same inlined app.");
  }
}

function assertFaviconIsInlined(distDir) {
  const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");

  if (!/rel="icon"/.test(indexHtml)) {
    throw new Error("Static site output is missing a favicon link.");
  }

  if (!/href="data:image\/svg\+xml/.test(indexHtml)) {
    throw new Error("Static favicon must be inlined so the single-file HTML works without extra assets.");
  }
}

function assertHeaderLogoIsSelfContained(distDir) {
  const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");

  if (/assets\/app-logo[-\w]*\.svg/.test(indexHtml)) {
    throw new Error("Header app logo must not reference an external SVG asset in the single-file HTML build.");
  }

  if (/className:[`'"]app-logo[`'"],src:/.test(indexHtml)) {
    throw new Error("Header app logo must be an inline SVG, not an img tag with a generated src value.");
  }

  if (!/viewBox:[`'"]0 0 1024 1024[`'"]/.test(indexHtml)) {
    throw new Error("Header app logo inline SVG was not found in the single-file HTML build.");
  }
}

const forbiddenCurrentReleaseMarkers = [
  { pattern: /\blicense\s*:\s*["'`]/i, label: "package license metadata" },
  { pattern: /vitest run/i, label: "package scripts" },
  { pattern: /@tauri-apps\/api/i, label: "tooling dependencies" },
];

export function assertCurrentReleaseHasNoPackageMetadata(distDir) {
  for (const fileName of ["index.html", "gpt-image-2-studio-lite.html"]) {
    const html = readFileSync(join(distDir, fileName), "utf8");

    for (const { pattern, label } of forbiddenCurrentReleaseMarkers) {
      if (pattern.test(html)) {
        throw new Error(`${fileName} contains forbidden ${label}.`);
      }
    }
  }
}

export function runStaticSiteCheck({ rootDir = defaultRootDir, distDir = join(rootDir, "dist-static") } = {}) {
  assertRequiredFiles(distDir);
  assertSingleFileParity(distDir);
  assertCurrentReleaseHasNoPackageMetadata(distDir);
  const manifest = assertVersionManifestAndArchives({ rootDir, distDir });
  assertCurrentReleaseMatchesArchive({ rootDir, distDir, manifest });
  assertFaviconIsInlined(distDir);
  assertHeaderLogoIsSelfContained(distDir);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  runStaticSiteCheck();
  console.log("Static site check passed.");
}
