import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
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
  const reachableNormalFiles = readNormalEntryGraph(normalDir);
  const staticFiles = readBundleFiles(staticDir, "Static build", { ignoredTopLevelDirectories: new Set(["versions"]) });
  const normalAdapterFiles = reachableNormalFiles.filter(({ manifestKey, path, source }) =>
    /tauriAdapter/i.test(manifestKey) || /tauriAdapter/i.test(source ?? "") || /tauriAdapter.*\.js$/i.test(basename(path))
  );
  const reachableNormalText = reachableNormalFiles.map(({ contents }) => contents).join("\n");

  if (normalAdapterFiles.length === 0) {
    throw new Error("Normal build HTML entry graph does not contain a reachable Tauri adapter chunk.");
  }
  if (!reachableNormalText.includes("__TAURI_INTERNALS__")) {
    throw new Error("Normal build reachable Tauri adapter graph does not contain the emitted Tauri bridge marker.");
  }
  if (!reachableNormalText.includes("save_generated_image")) {
    throw new Error("Normal build reachable Tauri adapter graph does not contain the native save command marker.");
  }

  for (const { path, contents } of staticFiles) {
    const marker = STATIC_NATIVE_MARKERS.find((candidate) => contents.includes(candidate));
    if (marker) {
      throw new Error(`Static build contains native bridge marker ${marker} in ${path}.`);
    }
  }
}

function readNormalEntryGraph(directory) {
  const rootDir = resolve(directory);
  const manifestPath = join(rootDir, ".vite", "manifest.json");
  if (!existsSync(manifestPath) || !lstatSync(manifestPath).isFile()) {
    throw new Error(`Normal build Vite manifest is missing: ${manifestPath}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error("Normal build Vite manifest is invalid JSON.", { cause: error });
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Normal build Vite manifest must be an object.");
  }

  const entryKeys = Object.entries(manifest)
    .filter(([key, entry]) => entry?.isEntry === true && (/\.html$/i.test(key) || /\.html$/i.test(entry.src ?? "")))
    .map(([key]) => key);
  if (entryKeys.length === 0) {
    throw new Error("Normal build Vite manifest has no HTML entry.");
  }

  const reachable = [];
  const visited = new Set();
  const pending = [...entryKeys];
  while (pending.length > 0) {
    const manifestKey = pending.pop();
    if (visited.has(manifestKey)) {
      continue;
    }
    const entry = manifest[manifestKey];
    if (!entry || typeof entry.file !== "string") {
      throw new Error(`Normal build Vite manifest entry is missing an emitted file: ${manifestKey}`);
    }
    visited.add(manifestKey);

    const emittedPath = resolve(rootDir, entry.file);
    const emittedRelativePath = relative(rootDir, emittedPath);
    if (
      !emittedRelativePath
      || emittedRelativePath === ".."
      || emittedRelativePath.startsWith(`..${sep}`)
      || isAbsolute(emittedRelativePath)
      || !existsSync(emittedPath)
      || !lstatSync(emittedPath).isFile()
    ) {
      throw new Error(`Normal build Vite manifest points outside the emitted bundle or to a missing file: ${entry.file}`);
    }

    reachable.push({
      manifestKey,
      path: emittedPath,
      source: entry.src,
      contents: readFileSync(emittedPath, "utf8"),
    });
    for (const dependencyKey of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
      if (typeof dependencyKey !== "string" || !manifest[dependencyKey]) {
        throw new Error(`Normal build Vite manifest references a missing dependency: ${dependencyKey}`);
      }
      pending.push(dependencyKey);
    }
  }

  return reachable;
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
