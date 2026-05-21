import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(".");
const distDir = resolve(rootDir, "dist-static");
const requiredFiles = [
  "index.html",
  "gpt-image-2-studio-lite.html",
];

const secretPatterns = [
  {
    label: "real-looking API key",
    pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/g,
  },
];

function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return listFiles(absolutePath);
    }

    return [absolutePath];
  });
}

function assertRequiredFiles() {
  const missing = requiredFiles.filter((file) => !existsSync(join(distDir, file)));

  if (missing.length > 0) {
    throw new Error(`Static site output is missing: ${missing.join(", ")}`);
  }
}

function assertNoSecrets() {
  const findings = [];

  for (const file of listFiles(distDir)) {
    const stats = statSync(file);

    if (stats.size > 10 * 1024 * 1024) {
      continue;
    }

    const contents = readFileSync(file, "utf8");

    for (const secretPattern of secretPatterns) {
      if (secretPattern.pattern.test(contents)) {
        findings.push(`${file} contains ${secretPattern.label}.`);
      }

      secretPattern.pattern.lastIndex = 0;
    }
  }

  if (findings.length > 0) {
    throw new Error(`Static site secret scan failed:\n${findings.map((item) => `- ${item}`).join("\n")}`);
  }
}

function assertSingleFileParity() {
  const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");
  const liteHtml = readFileSync(join(distDir, "gpt-image-2-studio-lite.html"), "utf8");

  if (indexHtml !== liteHtml) {
    throw new Error("dist-static/index.html and gpt-image-2-studio-lite.html must contain the same inlined app.");
  }
}

function assertFaviconIsInlined() {
  const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");

  if (!/rel="icon"/.test(indexHtml)) {
    throw new Error("Static site output is missing a favicon link.");
  }

  if (!/href="data:image\/svg\+xml/.test(indexHtml)) {
    throw new Error("Static favicon must be inlined so the single-file HTML works without extra assets.");
  }
}

function assertHeaderLogoIsSelfContained() {
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

assertRequiredFiles();
assertNoSecrets();
assertSingleFileParity();
assertFaviconIsInlined();
assertHeaderLogoIsSelfContained();

console.log("Static site check passed.");
