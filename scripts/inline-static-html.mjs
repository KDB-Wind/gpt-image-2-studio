import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectExecution } from "./archive-static-version.mjs";

const defaultRootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function copyStaticArchives({ rootDir, distDir = join(rootDir, "dist-static") }) {
  const sourceVersionsDir = join(rootDir, "static-versions", "versions");
  const sourceManifestPath = join(rootDir, "static-versions", "manifest.json");
  const distVersionsDir = join(distDir, "versions");

  if (!existsSync(sourceVersionsDir)) {
    throw new Error(`Static version source is missing: ${sourceVersionsDir}`);
  }

  if (!existsSync(sourceManifestPath)) {
    throw new Error(`Static version manifest is missing: ${sourceManifestPath}`);
  }

  mkdirSync(distVersionsDir, { recursive: true });
  cpSync(sourceVersionsDir, distVersionsDir, { recursive: true });
  cpSync(sourceManifestPath, join(distVersionsDir, "manifest.json"));
}

function readDistAsset(distDir, assetPath) {
  const normalized = assetPath.replace(/^\.\//, "").replace(/^\//, "");
  const distRoot = resolve(distDir);
  const absolutePath = resolve(distRoot, normalized);
  const relativePath = relative(distRoot, absolutePath);

  if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`Refusing to inline asset outside dist-static: ${assetPath}`);
  }

  if (!existsSync(absolutePath)) {
    throw new Error(`Referenced static asset was not found: ${assetPath}`);
  }

  return readFileSync(absolutePath, "utf8");
}

function svgToDataUri(svg) {
  const normalizedSvg = svg.replace(/\r\n?/g, "\n");
  return `data:image/svg+xml,${encodeURIComponent(normalizedSvg)
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/")}`;
}

export function inlineStaticHtml({ rootDir = defaultRootDir, distDir = join(rootDir, "dist-static") } = {}) {
  const htmlPath = join(distDir, "index.html");
  const releaseHtmlPath = join(distDir, "gpt-image-2-studio-lite.html");
  const viteHtmlPath = existsSync(htmlPath) ? htmlPath : join(distDir, "index.static.html");

  if (!existsSync(viteHtmlPath)) {
    throw new Error(`Static build HTML was not found: ${viteHtmlPath}`);
  }

  let html = readFileSync(viteHtmlPath, "utf8");

  html = html.replace(/\s*<link\b[^>]*rel=["']modulepreload["'][^>]*>/g, "");

  html = html.replace(
    /<link\b(?=[^>]*rel=["']icon["'])(?=[^>]*href=["'])([^>]*href=["'])([^"']+)(["'][^>]*>)/g,
    (tag, hrefPrefix, href, end) => {
      if (href.startsWith("data:")) {
        return tag;
      }

      return `<link${hrefPrefix}${svgToDataUri(readDistAsset(distDir, href))}${end}`;
    },
  );

  html = html.replace(
    /\s*<link\b(?=[^>]*rel=["']stylesheet["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/g,
    (_tag, href) => `\n    <style>\n${readDistAsset(distDir, href)}\n    </style>`,
  );

  html = html.replace(
    /\s*<script\b(?=[^>]*type=["']module["'])(?=[^>]*src=["']([^"']+)["'])[^>]*><\/script>/g,
    (_tag, src) => `\n    <script type="module">\n${readDistAsset(distDir, src)}\n    </script>`,
  );

  html = html.replace(/\r\n?/g, "\n");
  // Keep the generated release bytes stable when source HTML line endings differ.
  html = html.replace(/\n+  <\/body>/, "\n\n  </body>");

  writeFileSync(htmlPath, html, "utf8");
  writeFileSync(releaseHtmlPath, html, "utf8");
  copyStaticArchives({ rootDir, distDir });
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  inlineStaticHtml();
}
