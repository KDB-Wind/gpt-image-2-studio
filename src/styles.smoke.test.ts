// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");
const desktopStyles = styles.split("@media")[0] ?? styles;

describe("responsive shell styles", () => {
  it("styles the vector logo as a compact brand mark", () => {
    expect(styles).toMatch(/\.brand-lockup\s*\{[\s\S]*display:\s*flex/);
    expect(styles).toMatch(/\.app-logo\s*\{[\s\S]*drop-shadow/);
  });

  it("styles the GitHub project link as an icon label pill", () => {
    expect(styles).toMatch(/\.github-link\s*\{[\s\S]*gap:\s*8px/);
    expect(styles).toMatch(/\.github-link\s*\{[\s\S]*border-radius:\s*14px/);
    expect(styles).toMatch(/\.github-icon\s*\{[\s\S]*width:\s*1\.05rem/);
    expect(styles).toMatch(/\.github-icon\s*\{[\s\S]*height:\s*1\.05rem/);
  });

  it("keeps the workspace single-column on narrow screens", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*860px\)[\s\S]*\.workspace-grid[\s\S]*grid-template-columns:\s*1fr/);
  });

  it("uses tab-scoped mobile panels instead of stacking the full desktop workspace", () => {
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*860px\)[\s\S]*\.tab-generate\s+\.history-panel[\s\S]*display:\s*none/,
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*860px\)[\s\S]*\.tab-batch\s+\.history-panel[\s\S]*display:\s*none/,
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*860px\)[\s\S]*\.tab-history\s+\.control-panel[\s\S]*display:\s*none/,
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*860px\)[\s\S]*\.tab-history\s+\.preview-panel[\s\S]*display:\s*none/,
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*860px\)[\s\S]*\.tab-settings\s+\.preview-panel[\s\S]*display:\s*none/,
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*860px\)[\s\S]*\.tab-settings\s+\.history-panel[\s\S]*display:\s*none/,
    );
  });

  it("keeps the mobile tab strip reachable while scrolling long forms", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*860px\)[\s\S]*\.tab-strip[\s\S]*position:\s*sticky/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*860px\)[\s\S]*\.tab-strip[\s\S]*top:\s*10px/);
  });

  it("uses the same desktop workspace columns for history as other tabs", () => {
    expect(desktopStyles).not.toMatch(/\.history-focus\s+\.workspace-grid\s*\{[\s\S]*grid-template-columns/);
  });

  it("styles the generation image options as a compact visual picker", () => {
    expect(styles).toMatch(/\.quick-output-options\s*\{[\s\S]*width:\s*100%/);
    expect(styles).toMatch(/\.quick-output-options\s*\{[\s\S]*box-sizing:\s*border-box/);
    expect(styles).toMatch(/\.quick-output-options\s+summary\s*\{[\s\S]*display:\s*flex/);
    expect(styles).toMatch(/\.quick-output-options-body\s*\{[\s\S]*min-width:\s*0/);
    expect(styles).toMatch(/\.quick-option-group\s*\{[\s\S]*display:\s*grid/);
    expect(styles).toMatch(/\.quick-option-chip\s*\{[\s\S]*border-radius:\s*16px/);
    expect(styles).toMatch(/\.quick-option-chip\.active\s*\{[\s\S]*background:\s*linear-gradient/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*860px\)[\s\S]*\.quick-option-group[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
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
