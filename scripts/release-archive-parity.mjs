import { resolve } from "node:path";

import { isDirectExecution } from "./archive-static-version.mjs";
import { assertCurrentReleaseMatchesArchive } from "./static-site-check.mjs";

export function runReleaseArchiveParity({ rootDir = resolve("."), distDir } = {}) {
  assertCurrentReleaseMatchesArchive({ rootDir, distDir });
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  try {
    runReleaseArchiveParity();
    console.log("Release archive parity check passed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown release archive parity failure.";
    console.error(`Release archive parity check failed: ${message}`);
    process.exit(1);
  }
}
