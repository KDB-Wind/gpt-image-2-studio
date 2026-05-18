import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(rootDir, "dist-static");
const htmlPath = resolve(distDir, "index.html");
const viteHtmlPath = existsSync(htmlPath) ? htmlPath : resolve(distDir, "index.static.html");

if (!existsSync(viteHtmlPath)) {
  throw new Error(`Static build HTML was not found: ${htmlPath}`);
}

function readDistAsset(assetPath) {
  const normalized = assetPath.replace(/^\.\//, "").replace(/^\//, "");
  const absolutePath = resolve(distDir, normalized);

  if (!absolutePath.startsWith(distDir)) {
    throw new Error(`Refusing to inline asset outside dist-static: ${assetPath}`);
  }

  if (!existsSync(absolutePath)) {
    throw new Error(`Referenced static asset was not found: ${assetPath}`);
  }

  return readFileSync(absolutePath, "utf8");
}

let html = readFileSync(viteHtmlPath, "utf8");

html = html.replace(/\s*<link\b[^>]*rel=["']modulepreload["'][^>]*>/g, "");

html = html.replace(
  /\s*<link\b(?=[^>]*rel=["']stylesheet["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/g,
  (_tag, href) => `\n    <style>\n${readDistAsset(href)}\n    </style>`,
);

html = html.replace(
  /\s*<script\b(?=[^>]*type=["']module["'])(?=[^>]*src=["']([^"']+)["'])[^>]*><\/script>/g,
  (_tag, src) => `\n    <script type="module">\n${readDistAsset(src)}\n    </script>`,
);

writeFileSync(htmlPath, html, "utf8");
