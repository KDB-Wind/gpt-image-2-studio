// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import * as cleanStaticReproCheck from "./clean-static-repro-check.mjs";

const { runCleanStaticReproCheck } = cleanStaticReproCheck;

function writeFile(path, contents) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function createRepository({ archiveHtml, buildHtml = archiveHtml }) {
  const rootDir = mkdtempSync(join(tmpdir(), "chat-to-image-clean-repro-fixture-"));
  writeFile(
    join(rootDir, "package.json"),
    JSON.stringify({
      name: "clean-repro-fixture",
      version: "1.0.0",
      scripts: { "build:static": "node build.mjs" },
    }, null, 2) + "\n",
  );
  writeFile(
    join(rootDir, "package-lock.json"),
    JSON.stringify({
      name: "clean-repro-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: "clean-repro-fixture", version: "1.0.0" } },
    }, null, 2) + "\n",
  );
  writeFile(
    join(rootDir, "build.mjs"),
    `import { mkdirSync, writeFileSync } from 'node:fs';\nconst output = ${JSON.stringify(buildHtml)};\nmkdirSync('dist-static', { recursive: true });\nfor (const file of ['index.html', 'gpt-image-2-studio-lite.html']) writeFileSync(\`dist-static/\${file}\`, output);\n`,
  );
  writeFile(join(rootDir, "static-versions", "versions", "v1.0.0", "index.html"), archiveHtml);
  writeFile(join(rootDir, "dist-static", "index.html"), archiveHtml);
  writeFile(join(rootDir, "dist-static", "gpt-image-2-studio-lite.html"), archiveHtml);
  writeFile(join(rootDir, ".gitignore"), "node_modules/\n");

  for (const args of [
    ["init"],
    ["config", "user.email", "clean-repro@example.invalid"],
    ["config", "user.name", "Clean Repro Test"],
    ["add", "."],
    ["commit", "-m", "fixture"],
  ]) {
    const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`Fixture git command failed: git ${args[0]}`);
    }
  }

  return rootDir;
}

describe("clean static reproducibility", () => {
  it("uses the npm CLI through Node without a Windows shell fallback", () => {
    const execPath = join("runtime", "node.exe");
    const npmExecPath = join(dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
    expect(typeof cleanStaticReproCheck.resolveNpmInvocation).toBe("function");
    expect(cleanStaticReproCheck.resolveNpmInvocation({
      execPath,
      npmExecPath: undefined,
      existsSyncImpl: (path) => path === npmExecPath,
    })).toEqual({
      command: execPath,
      prefixArgs: [npmExecPath],
      shell: false,
    });
  });

  it("builds clean HEAD twice and matches both tracked release files to the archive blob", () => {
    const rootDir = createRepository({ archiveHtml: "<html>stable</html>\n" });

    expect(() => runCleanStaticReproCheck({ rootDir })).not.toThrow();
  }, 20_000);

  it("fails when a clean HEAD build differs from the tracked archive blob", () => {
    const rootDir = createRepository({
      archiveHtml: "<html>archive</html>\n",
      buildHtml: "<html>clean build mismatch</html>\n",
    });

    expect(() => runCleanStaticReproCheck({ rootDir })).toThrow(/clean HEAD build.*tracked archive/i);
  }, 20_000);
});
