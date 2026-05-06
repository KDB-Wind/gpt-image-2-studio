// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");

describe("responsive shell styles", () => {
  it("keeps the workspace single-column on narrow screens", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*860px\)[\s\S]*\.workspace-grid[\s\S]*grid-template-columns:\s*1fr/);
  });

  it("keeps the support entry visible without covering the main layout on phones", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.support-fab[\s\S]*left:\s*16px/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.support-fab[\s\S]*bottom:\s*14px/);
  });

  it("prevents long provider errors and image previews from overflowing their cards", () => {
    expect(styles).toMatch(/\.preview-frame\s*\{[\s\S]*max-width:\s*100%/);
    expect(styles).toMatch(/\.error-copy[\s\S]*overflow-wrap:\s*anywhere/);
  });
});
