import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { isDirectExecution, validateVersionManifest } from "./archive-static-version.mjs";

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
  assertStaticVersionArchivesMatch({ rootDir, distDir });
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

export function runStaticSiteCheck({ rootDir = defaultRootDir, distDir = join(rootDir, "dist-static") } = {}) {
  assertRequiredFiles(distDir);
  assertSingleFileParity(distDir);
  assertVersionManifestAndArchives({ rootDir, distDir });
  assertFaviconIsInlined(distDir);
  assertHeaderLogoIsSelfContained(distDir);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  runStaticSiteCheck();
  console.log("Static site check passed.");
}
