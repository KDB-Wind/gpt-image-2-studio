// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");

describe("responsive shell styles", () => {
  it("styles the vector logo as a compact brand mark", () => {
    expect(styles).toMatch(/\.brand-lockup\s*\{[\s\S]*display:\s*flex/);
    expect(styles).toMatch(/\.app-logo\s*\{[\s\S]*drop-shadow/);
  });

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

  it("keeps the desktop history list tall enough before scrolling", () => {
    expect(styles).toMatch(/\.history-body\s*\{[\s\S]*max-height:\s*980px/);
  });

  it("keeps long prompt review fields scrollable instead of stretching the form", () => {
    expect(styles).toMatch(/\.field-readonly\s+\.readonly-value\s*\{[\s\S]*max-height:\s*12rem/);
    expect(styles).toMatch(/\.field-readonly\s+\.readonly-value\s*\{[\s\S]*overflow:\s*auto/);
    expect(styles).toMatch(/\.image-name-field\s*\{[\s\S]*align-self:\s*start/);
  });

  it("uses compact editors for batch task prompts and image names", () => {
    expect(styles).toMatch(/\.batch-task-prompt-textarea\s*\{[\s\S]*min-height:\s*5\.75rem/);
    expect(styles).toMatch(/\.batch-task-prompt-textarea\s*\{[\s\S]*max-height:\s*12rem/);
    expect(styles).toMatch(/\.batch-task-name-field\s*\{[\s\S]*max-width:\s*32rem/);
  });
});
