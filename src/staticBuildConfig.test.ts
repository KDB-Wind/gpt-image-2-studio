import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json";
import staticViteConfig from "../vite.static.config";

describe("static basic tool build", () => {
  it("exposes a build script for the double-click HTML package", () => {
    expect(packageJson.scripts["build:static"]).toBe(
      "tsc && vite build --config vite.static.config.ts && node scripts/inline-static-html.mjs",
    );
  });

  it("uses relative assets and a separate output directory", () => {
    expect(staticViteConfig.base).toBe("./");
    expect(staticViteConfig.build?.assetsInlineLimit).toBeGreaterThan(1024 * 1024);
    expect(staticViteConfig.build?.outDir).toBe("dist-static");
    expect(staticViteConfig.build?.rollupOptions?.input).toBe("index.static.html");
  });

  it("uses a static HTML entry that mounts only the basic tool", () => {
    const html = readFileSync("index.static.html", "utf8");
    const entry = readFileSync("src/staticMain.tsx", "utf8");

    expect(html).toContain('src="./src/staticMain.tsx"');
    expect(entry).toContain('import App from "./App"');
    expect(entry).not.toContain("RootApp");
    expect(entry).not.toContain("PlatformApp");
  });
});
