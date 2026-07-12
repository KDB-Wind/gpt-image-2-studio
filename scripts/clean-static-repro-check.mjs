import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { isDirectExecution } from "./archive-static-version.mjs";

const maxBuffer = 32 * 1024 * 1024;

function commandFailed(result) {
  return result.error || result.status !== 0;
}

function runCommand(spawnSyncImpl, command, args, options, label) {
  const result = spawnSyncImpl(command, args, {
    ...options,
    encoding: null,
    maxBuffer,
  });
  if (commandFailed(result)) {
    throw new Error(`${label} failed.`);
  }
  return result;
}

function readHeadBlob(spawnSyncImpl, rootDir, relativePath) {
  const gitPath = relativePath.replace(/\\/g, "/");
  const result = runCommand(
    spawnSyncImpl,
    "git",
    ["show", `HEAD:${gitPath}`],
    { cwd: rootDir },
    `Reading tracked HEAD ${gitPath}`,
  );
  if (!Buffer.isBuffer(result.stdout)) {
    throw new Error(`Tracked HEAD ${gitPath} did not return immutable bytes.`);
  }
  return result.stdout;
}

function assertSameBytes(actual, expected, message) {
  if (!Buffer.isBuffer(actual) || actual.compare(expected) !== 0) {
    throw new Error(message);
  }
}

function assertTemporaryPath(tempParent, candidate) {
  const resolvedParent = resolve(tempParent);
  const resolvedCandidate = resolve(candidate);
  const relativePath = relative(resolvedParent, resolvedCandidate);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error("Clean static checkout escaped the temporary directory.");
  }
}

export function resolveNpmInvocation({ execPath, npmExecPath, existsSyncImpl = existsSync }) {
  if (npmExecPath) {
    return { command: execPath, prefixArgs: [npmExecPath], shell: false };
  }

  const bundledNpmCli = join(dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSyncImpl(bundledNpmCli)) {
    return { command: execPath, prefixArgs: [bundledNpmCli], shell: false };
  }

  if (process.platform === "win32") {
    throw new Error("npm CLI could not be resolved without an unsafe shell fallback.");
  }

  return {
    command: "npm",
    prefixArgs: [],
    shell: false,
  };
}

export function runCleanStaticReproCheck({
  rootDir = resolve("."),
  spawnSyncImpl = spawnSync,
  tempParent = tmpdir(),
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
} = {}) {
  const packageJson = JSON.parse(readHeadBlob(spawnSyncImpl, rootDir, "package.json").toString("utf8"));
  const version = packageJson?.version;
  if (typeof version !== "string" || !version) {
    throw new Error("Tracked HEAD package version is missing.");
  }

  const archiveRelativePath = join("static-versions", "versions", `v${version}`, "index.html");
  const archiveBytes = readHeadBlob(spawnSyncImpl, rootDir, archiveRelativePath);
  for (const releasePath of ["dist-static/index.html", "dist-static/gpt-image-2-studio-lite.html"]) {
    assertSameBytes(
      readHeadBlob(spawnSyncImpl, rootDir, releasePath),
      archiveBytes,
      `Tracked HEAD ${releasePath} must be byte-identical to ${archiveRelativePath.replace(/\\/g, "/")}.`,
    );
  }

  const tempRoot = mkdtempSync(join(tempParent, "chat-to-image-clean-static-"));
  const checkoutDir = join(tempRoot, "checkout");
  assertTemporaryPath(tempParent, checkoutDir);
  let worktreeAdded = false;

  try {
    runCommand(
      spawnSyncImpl,
      "git",
      ["worktree", "add", "--detach", checkoutDir, "HEAD"],
      { cwd: rootDir },
      "Creating clean HEAD worktree",
    );
    worktreeAdded = true;

    const npm = resolveNpmInvocation({ execPath, npmExecPath });
    runCommand(
      spawnSyncImpl,
      npm.command,
      [...npm.prefixArgs, "ci"],
      { cwd: checkoutDir, shell: npm.shell },
      "Installing clean HEAD dependencies",
    );

    let firstBuildBytes;
    for (let buildNumber = 1; buildNumber <= 2; buildNumber += 1) {
      runCommand(
        spawnSyncImpl,
        npm.command,
        [...npm.prefixArgs, "run", "build:static"],
        { cwd: checkoutDir, shell: npm.shell },
        `Clean HEAD static build ${buildNumber}`,
      );

      const indexBytes = readFileSync(join(checkoutDir, "dist-static", "index.html"));
      const liteBytes = readFileSync(join(checkoutDir, "dist-static", "gpt-image-2-studio-lite.html"));
      assertSameBytes(indexBytes, liteBytes, "Clean HEAD release HTML outputs must be byte-identical.");
      assertSameBytes(indexBytes, archiveBytes, "Clean HEAD build must be byte-identical to the tracked archive blob.");
      if (firstBuildBytes) {
        assertSameBytes(indexBytes, firstBuildBytes, "Repeated clean HEAD static builds must be byte-identical.");
      } else {
        firstBuildBytes = indexBytes;
      }
    }
  } finally {
    if (worktreeAdded) {
      spawnSyncImpl("git", ["worktree", "remove", "--force", checkoutDir], {
        cwd: rootDir,
        encoding: null,
        maxBuffer,
      });
      spawnSyncImpl("git", ["worktree", "prune"], { cwd: rootDir, encoding: null, maxBuffer });
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  try {
    runCleanStaticReproCheck();
    console.log("Clean HEAD static reproducibility check passed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown clean static reproducibility failure.";
    console.error(`Clean HEAD static reproducibility check failed: ${message}`);
    process.exit(1);
  }
}
