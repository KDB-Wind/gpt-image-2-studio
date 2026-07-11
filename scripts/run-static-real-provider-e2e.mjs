import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const playwrightCli = resolve("node_modules", "@playwright", "test", "cli.js");
const args = [
  playwrightCli,
  "test",
  "tests/e2e/static-html-real-provider.spec.ts",
  "--config=playwright.static.real-provider.config.ts",
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, args, {
  env: {
    ...process.env,
    E2E_REAL_PROVIDER: "1",
  },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
