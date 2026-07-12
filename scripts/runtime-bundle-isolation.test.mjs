import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const fixtureRoots = [];

afterEach(() => {
  for (const rootDir of fixtureRoots.splice(0)) {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

describe("runtime bundle isolation checker", () => {
  it("accepts emitted normal chunks with the Tauri bridge and static output without it", () => {
    const fixture = createBundleFixture();
    const result = runChecker(fixture);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Runtime bundle isolation check passed.");
  });

  it("rejects a normal build that lost its emitted Tauri adapter chunk", () => {
    const fixture = createBundleFixture({ includeNormalBridge: false });
    const result = runChecker(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/normal build.*Tauri adapter chunk/i);
  });

  it("rejects emitted static HTML or chunks containing native bridge markers", () => {
    const fixture = createBundleFixture({ leakStaticBridge: true });
    const result = runChecker(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/static build.*native bridge marker/i);
  });
});

function createBundleFixture({ includeNormalBridge = true, leakStaticBridge = false } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "chat-to-image-runtime-bundles-"));
  fixtureRoots.push(rootDir);
  const normalDir = join(rootDir, "dist");
  const staticDir = join(rootDir, "dist-static");
  mkdirSync(join(normalDir, "assets"), { recursive: true });
  mkdirSync(join(staticDir, "assets"), { recursive: true });

  writeFileSync(join(normalDir, "index.html"), '<script type="module" src="./assets/index.js"></script>', "utf8");
  writeFileSync(
    join(normalDir, "assets", "index.js"),
    includeNormalBridge ? 'import("./tauriAdapter-test.js")' : 'console.log("web only")',
    "utf8",
  );
  if (includeNormalBridge) {
    writeFileSync(
      join(normalDir, "assets", "tauriAdapter-test.js"),
      'window.__TAURI_INTERNALS__.invoke("save_generated_image"); "plugin:dialog|open";',
      "utf8",
    );
  }

  const staticMarker = leakStaticBridge ? "window.__TAURI_INTERNALS__.invoke('save_generated_image')" : "web runtime only";
  writeFileSync(join(staticDir, "index.html"), `<script>${staticMarker}</script>`, "utf8");
  writeFileSync(join(staticDir, "gpt-image-2-studio-lite.html"), `<script>${staticMarker}</script>`, "utf8");
  mkdirSync(join(staticDir, "versions", "v0.1.5"), { recursive: true });
  writeFileSync(
    join(staticDir, "versions", "v0.1.5", "index.html"),
    '<script>window.__TAURI_INTERNALS__.invoke("immutable_historical_command")</script>',
    "utf8",
  );

  return { normalDir, staticDir };
}

function runChecker({ normalDir, staticDir }) {
  return spawnSync(
    process.execPath,
    [
      "scripts/check-runtime-bundle-isolation.mjs",
      "--normal-dir",
      normalDir,
      "--static-dir",
      staticDir,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
}
