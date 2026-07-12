import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const INSPECTED_EXTENSIONS = new Set([".html", ".js", ".mjs"]);
const STATIC_NATIVE_MARKERS = [
  "__TAURI_INTERNALS__",
  "tauriAdapter",
  "plugin:dialog|open",
  "plugin:opener|",
  "save_generated_image",
  "@tauri-apps/",
];

export function checkRuntimeBundleIsolation({
  normalDir = resolve("dist"),
  staticDir = resolve("dist-static"),
} = {}) {
  const normalFiles = readBundleFiles(normalDir, "Normal build");
  const staticFiles = readBundleFiles(staticDir, "Static build", { ignoredTopLevelDirectories: new Set(["versions"]) });
  const normalAdapterFiles = normalFiles.filter(({ path }) => /tauriAdapter.*\.js$/i.test(basename(path)));
  const normalText = normalFiles.map(({ contents }) => contents).join("\n");

  if (normalAdapterFiles.length === 0) {
    throw new Error("Normal build does not contain an emitted Tauri adapter chunk.");
  }
  if (!normalText.includes("__TAURI_INTERNALS__")) {
    throw new Error("Normal build does not contain the emitted Tauri bridge marker.");
  }
  if (!normalText.includes("save_generated_image")) {
    throw new Error("Normal build Tauri adapter chunk does not contain the native save command marker.");
  }

  for (const { path, contents } of staticFiles) {
    const marker = STATIC_NATIVE_MARKERS.find((candidate) => contents.includes(candidate));
    if (marker) {
      throw new Error(`Static build contains native bridge marker ${marker} in ${path}.`);
    }
  }
}

function readBundleFiles(directory, label, { ignoredTopLevelDirectories = new Set() } = {}) {
  const rootDir = resolve(directory);
  if (!existsSync(rootDir) || !lstatSync(rootDir).isDirectory()) {
    throw new Error(`${label} directory is missing: ${rootDir}`);
  }

  const files = [];
  const pending = [rootDir];
  while (pending.length > 0) {
    const currentDir = pending.pop();
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (currentDir === rootDir && ignoredTopLevelDirectories.has(entry.name)) {
          continue;
        }
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !INSPECTED_EXTENSIONS.has(extensionOf(entry.name))) {
        continue;
      }
      files.push({ path: entryPath, contents: readFileSync(entryPath, "utf8") });
    }
  }

  if (files.length === 0) {
    throw new Error(`${label} has no emitted HTML or JavaScript artifacts.`);
  }
  return files;
}

function extensionOf(fileName) {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index) : "";
}

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? resolve(process.argv[index + 1]) : fallback;
}

if (typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkRuntimeBundleIsolation({
      normalDir: readArgument("--normal-dir", resolve("dist")),
      staticDir: readArgument("--static-dir", resolve("dist-static")),
    });
    console.log("Runtime bundle isolation check passed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runtime bundle isolation failure.";
    console.error(`Runtime bundle isolation check failed: ${message}`);
    process.exit(1);
  }
}
