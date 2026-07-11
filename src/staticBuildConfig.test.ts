import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json";
import viteConfig from "../vite.config";
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

  it("injects only the package version into both Vite builds", () => {
    expect(viteConfig.define?.__APP_VERSION__).toBe(JSON.stringify(packageJson.version));
    expect(staticViteConfig.define?.__APP_VERSION__).toBe(JSON.stringify(packageJson.version));

    const appSource = readFileSync("src/App.tsx", "utf8");
    expect(appSource).not.toContain('import packageJson from "../package.json"');
    expect(appSource).toContain("const APP_VERSION = __APP_VERSION__;");
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
