import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(rootDir, "dist-static");
const htmlPath = resolve(distDir, "index.html");
const releaseHtmlPath = resolve(distDir, "gpt-image-2-studio-lite.html");
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

function svgToDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/")}`;
}

let html = readFileSync(viteHtmlPath, "utf8");

html = html.replace(/\s*<link\b[^>]*rel=["']modulepreload["'][^>]*>/g, "");

html = html.replace(
  /<link\b(?=[^>]*rel=["']icon["'])(?=[^>]*href=["'])([^>]*href=["'])([^"']+)(["'][^>]*>)/g,
  (tag, hrefPrefix, href, end) => {
    if (href.startsWith("data:")) {
      return tag;
    }

    return `<link${hrefPrefix}${svgToDataUri(readDistAsset(href))}${end}`;
  },
);

html = html.replace(
  /\s*<link\b(?=[^>]*rel=["']stylesheet["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/g,
  (_tag, href) => `\n    <style>\n${readDistAsset(href)}\n    </style>`,
);

html = html.replace(
  /\s*<script\b(?=[^>]*type=["']module["'])(?=[^>]*src=["']([^"']+)["'])[^>]*><\/script>/g,
  (_tag, src) => `\n    <script type="module">\n${readDistAsset(src)}\n    </script>`,
);

html = html.replace(/\r\n/g, "\n");

writeFileSync(htmlPath, html, "utf8");
writeFileSync(releaseHtmlPath, html, "utf8");
