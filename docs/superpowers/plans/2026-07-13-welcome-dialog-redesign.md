# Welcome Dialog Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stretched three-card welcome dialog with the approved compact onboarding layout and route users according to actual setup readiness.

**Architecture:** Keep the existing `Dialog`, persisted `hasDismissedWelcome` preference, runtime directory state, and tab system. Add one derived setup-readiness value and one primary-action handler in `App`, replace the welcome-only translation fields and markup, and scope the new responsive CSS under `.welcome-modal` so other dialogs are unchanged.

**Tech Stack:** React 19, TypeScript 6, CSS, Vitest 4, Playwright 1.61, Vite 8.

---

## File Map

- Modify: `src/App.tsx` - derive welcome setup readiness, implement conditional navigation, and render the compact welcome content.
- Modify: `src/i18n/translations.ts` - replace card-oriented welcome copy with compact bilingual onboarding copy and action labels.
- Modify: `src/styles.css` - remove stretched welcome-card rules and add scoped compact dialog, steps, privacy note, relay link, and mobile rules.
- Modify: `src/App.smoke.test.tsx` - cover incomplete/complete routing and persisted dismissal using controllable output-directory state.
- Modify: `src/App.test.tsx` - verify semantic three-step content and removal of the old card grid.
- Modify: `src/i18n/translations.test.ts` - verify required Chinese and English welcome copy.
- Modify: `tests/e2e/static-html-page.spec.ts` - verify desktop/mobile layout, centered markers, no overflow, and Settings routing.
- Modify: `docs/superpowers/specs/2026-07-13-welcome-dialog-redesign-design.md` - update status after verified implementation.

The implementation must not modify or overwrite `static-versions/versions/v0.1.7/index.html`. A later release decision can package the accepted change as `v0.1.8`.

### Task 1: Add Conditional Welcome Navigation

**Files:**
- Modify: `src/i18n/translations.ts:89-180`
- Modify: `src/i18n/translations.ts:385-396`
- Modify: `src/i18n/translations.ts:613-870`
- Modify: `src/i18n/translations.ts:1123-1382`
- Modify: `src/App.tsx:397-430`
- Modify: `src/App.tsx:1053-1061`
- Modify: `src/App.smoke.test.tsx:16-74`
- Modify: `src/App.smoke.test.tsx:103-145`
- Test: `src/i18n/translations.test.ts`

- [ ] **Step 1: Extend the smoke-test runtime helper**

Add an output-directory-state option to `createMockRuntime`:

```ts
function createMockRuntime(
  config: Partial<AppConfig> = {},
  options: {
    history?: ImageRecord[];
    prepareHistoryPreview?: RuntimeAdapter["prepareHistoryPreview"];
    prepareHistoryFile?: RuntimeAdapter["prepareHistoryFile"];
    outputDirectoryState?: OutputDirectoryState;
  } = {},
): RuntimeAdapter {
  // existing merge and adapter fields
  return {
    // existing adapter methods
    getOutputDirectoryState: async () =>
      options.outputDirectoryState ?? { status: "not-authorized" },
  };
}
```

- [ ] **Step 2: Write failing tests for incomplete and complete setup**

Add these behaviors to `src/App.smoke.test.tsx`:

```ts
it("routes an incomplete first-run setup to Settings", async () => {
  const copy = getTranslations("en-US");
  runtimeMock.adapter = createMockRuntime(
    { uiLanguage: "en-US", apiKey: "", hasDismissedWelcome: false },
    { outputDirectoryState: { status: "not-authorized" } },
  );

  await act(async () => root.render(<App />));
  await flushAppEffects();

  await act(async () => clickButton(container, copy.actions.goToSettings));
  await flushAppEffects();

  expect(container.querySelector(".app-shell")?.classList.contains("tab-settings")).toBe(true);
  expect(runtimeMock.saveConfig).toHaveBeenCalledWith(
    expect.objectContaining({ hasDismissedWelcome: true }),
  );
});

it("starts on Single image when first-run setup is already complete", async () => {
  const copy = getTranslations("en-US");
  runtimeMock.adapter = createMockRuntime(
    { uiLanguage: "en-US", apiKey: "test-key", hasDismissedWelcome: false },
    {
      outputDirectoryState: {
        status: "ready",
        name: "authorized-output",
        lastTestedAt: "2026-07-13T00:00:00.000Z",
      },
    },
  );

  await act(async () => root.render(<App />));
  await flushAppEffects();

  await act(async () => clickButton(container, copy.actions.startUsing));
  await flushAppEffects();

  expect(container.querySelector(".app-shell")?.classList.contains("tab-generate")).toBe(true);
  expect(runtimeMock.saveConfig).toHaveBeenCalledWith(
    expect.objectContaining({ hasDismissedWelcome: true }),
  );
});
```

- [ ] **Step 3: Run the focused smoke tests and confirm red**

Run:

```powershell
npx vitest run src/App.smoke.test.tsx
```

Expected: FAIL because `copy.actions.goToSettings` and conditional welcome routing do not exist.

- [ ] **Step 4: Replace the welcome translation contract**

Add action keys:

```ts
actions: {
  // existing actions
  goToSettings: string;
  setUpLater: string;
}
```

Replace the welcome type with:

```ts
welcome: {
  title: string;
  eyebrow: string;
  intro: string;
  setupTitle: string;
  setupSteps: Array<{ title: string; body: string }>;
  privacyNote: string;
  relayPrompt: string;
};
```

Use these Chinese action labels:

```ts
goToSettings: "前往设置",
setUpLater: "稍后设置",
```

Use these English action labels:

```ts
goToSettings: "Go to settings",
setUpLater: "Set up later",
```

Populate exactly three localized setup steps matching the approved design: model connection, authorized/tested output directory, then one successful single-image run before Batch.

- [ ] **Step 5: Add translation-contract tests**

Update `src/i18n/translations.test.ts`:

```ts
it("provides compact bilingual welcome guidance", () => {
  const zh = getTranslations("zh-CN");
  const en = getTranslations("en-US");

  expect(zh.welcome.setupSteps).toHaveLength(3);
  expect(en.welcome.setupSteps).toHaveLength(3);
  expect(zh.actions.goToSettings).toBe("前往设置");
  expect(en.actions.goToSettings).toBe("Go to settings");
  expect(zh.welcome.privacyNote).toContain("Base URL");
  expect(en.welcome.privacyNote).toContain("Base URL");
});
```

- [ ] **Step 6: Implement derived readiness and the primary action**

Near the existing `validation` and `showWelcome` values in `App.tsx`, add:

```ts
const isWelcomeSetupComplete =
  validation.errors.length === 0 && outputDirectoryState?.status === "ready";
```

Keep `handleDismissWelcome()` as the shared persistence operation, then add:

```ts
async function handleWelcomePrimaryAction() {
  await handleDismissWelcome();
  setActiveTab(isWelcomeSetupComplete ? "generate" : "settings");
}
```

Do not change `showWelcome = !isLoadingApp && !config.hasDismissedWelcome`.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npx vitest run src/App.smoke.test.tsx src/i18n/translations.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit behavior and copy**

```powershell
git add src/App.tsx src/App.smoke.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "fix: route welcome actions by setup state"
```

### Task 2: Replace The Stretched Card Layout

**Files:**
- Modify: `src/App.tsx:3020-3070`
- Modify: `src/styles.css:793`
- Modify: `src/styles.css:1722-1755`
- Modify: `src/styles.css:1800-1838`
- Modify: `src/styles.css:1885-2020`
- Test: `src/App.test.tsx:820-850`

- [ ] **Step 1: Replace the old checklist test with a structural regression test**

Update `src/App.test.tsx`:

```ts
it("renders the compact first-run welcome flow without stretched cards", async () => {
  window.localStorage.setItem(
    "chat-to-image.config.v1",
    JSON.stringify({ ...DEFAULT_CONFIG, uiLanguage: "en-US", hasDismissedWelcome: false }),
  );

  await act(async () => root.render(<App />));
  await flushEffects();

  expect(container.querySelector(".welcome-grid")).toBeNull();
  expect(container.querySelectorAll(".welcome-card")).toHaveLength(0);
  expect(container.querySelectorAll(".welcome-step")).toHaveLength(3);
  expect(container.querySelector(".welcome-privacy")?.textContent).toContain("Base URL");
  expect(container.querySelector(".welcome-relay-link")).not.toBeNull();
});
```

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```powershell
npx vitest run src/App.test.tsx --testNamePattern "compact first-run welcome"
```

Expected: FAIL because the old `.welcome-grid` and `.welcome-card` structure is still rendered.

- [ ] **Step 3: Replace the dialog markup**

Change the welcome `Dialog` to use `className="welcome-modal"` and remove `size="wide"`. Render one content flow:

```tsx
<Dialog
  open={showWelcome}
  title={copy.welcome.title}
  onClose={() => void handleDismissWelcome()}
  className="welcome-modal"
  footer={
    <>
      <button type="button" className="secondary-button" onClick={() => void handleDismissWelcome()}>
        {copy.actions.setUpLater}
      </button>
      <button type="button" className="primary-button" onClick={() => void handleWelcomePrimaryAction()}>
        {isWelcomeSetupComplete ? copy.actions.startUsing : copy.actions.goToSettings}
      </button>
    </>
  }
>
  <section className="welcome-content">
    <div className="welcome-intro">
      <p className="eyebrow">{copy.welcome.eyebrow}</p>
      <p>{copy.welcome.intro}</p>
    </div>

    <div>
      <h3>{copy.welcome.setupTitle}</h3>
      <ol className="welcome-steps">
        {copy.welcome.setupSteps.map((step, index) => (
          <li className="welcome-step" key={step.title}>
            <span className="welcome-step-number" aria-hidden="true">{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>

    <p className="welcome-privacy">{copy.welcome.privacyNote}</p>
    <p className="welcome-relay">
      {copy.welcome.relayPrompt}{" "}
      <button type="button" className="welcome-relay-link" onClick={() => void handleOpenRecommendedRelay()}>
        {copy.actions.openRecommended}
      </button>
    </p>
  </section>
</Dialog>
```

- [ ] **Step 4: Replace welcome-only CSS**

Remove `.welcome-grid`, `.welcome-card`, `.welcome-card.highlight`, and `.welcome-checklist` rules. Add:

```css
.welcome-modal {
  width: min(100%, 42rem);
}

.welcome-modal .modal-body {
  max-height: min(70vh, 42rem);
  overflow-y: auto;
}

.welcome-content {
  display: grid;
  gap: 18px;
}

.welcome-intro,
.welcome-step > div {
  min-width: 0;
}

.welcome-intro p,
.welcome-step p,
.welcome-privacy,
.welcome-relay {
  margin: 0;
}

.welcome-steps {
  display: grid;
  gap: 12px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.welcome-step {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 11px;
  align-items: start;
}

.welcome-step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  background: rgba(216, 117, 67, 0.12);
  color: var(--accent-strong);
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
  text-align: center;
}

.welcome-step strong {
  display: block;
  margin: 1px 0 3px;
}

.welcome-step p,
.welcome-relay {
  color: var(--text-muted);
  line-height: 1.55;
}

.welcome-privacy {
  padding: 11px 13px;
  border-left: 3px solid #3f7d5c;
  background: #f1f7f3;
  color: #486254;
  line-height: 1.55;
}

.welcome-relay-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-strong);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
```

Inside the existing `@media (max-width: 640px)` block, keep the column footer and add:

```css
.welcome-modal .modal-footer button {
  width: 100%;
}

.welcome-step-number {
  flex-shrink: 0;
}
```

- [ ] **Step 5: Update the existing smoke selector**

Replace the assertion that expects `.modal-card.wide` with:

```ts
expect(container.querySelector(".modal-card.welcome-modal")).not.toBeNull();
expect(container.querySelector(".modal-card.wide")).toBeNull();
```

- [ ] **Step 6: Run component and translation tests**

Run:

```powershell
npx vitest run src/App.test.tsx src/App.smoke.test.tsx src/i18n/translations.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the visual implementation**

```powershell
git add src/App.tsx src/App.test.tsx src/App.smoke.test.tsx src/styles.css src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "fix: replace stretched welcome cards"
```

### Task 3: Verify Desktop, Mobile, And Static Runtime

**Files:**
- Modify: `tests/e2e/static-html-page.spec.ts`
- Modify: `docs/superpowers/specs/2026-07-13-welcome-dialog-redesign-design.md`

- [ ] **Step 1: Add a desktop page-flow test**

Add to `tests/e2e/static-html-page.spec.ts`:

```ts
test("compact welcome routes incomplete setup to Settings", async ({ page }) => {
  await openCleanStaticPage(page, {
    uiLanguage: "en-US",
    apiKey: "",
    hasDismissedWelcome: false,
  });

  const dialog = page.getByRole("dialog", { name: "Welcome to Local Image Studio" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".welcome-step")).toHaveCount(3);
  await expect(dialog.locator(".welcome-card")).toHaveCount(0);

  const markerStyles = await dialog.locator(".welcome-step-number").evaluateAll((markers) =>
    markers.map((marker) => {
      const style = getComputedStyle(marker);
      const rect = marker.getBoundingClientRect();
      return {
        display: style.display,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        lineHeight: Number.parseFloat(style.lineHeight),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }),
  );

  for (const marker of markerStyles) {
    expect(marker).toMatchObject({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 26,
      height: 26,
    });
    expect(marker.lineHeight).toBeCloseTo(12.48, 1);
  }

  await page.getByRole("button", { name: "Go to settings" }).click();
  await expect(page.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
});
```

- [ ] **Step 2: Extend the Pixel 7 overflow test**

In the existing `@mobile` test, open the welcome dialog with `hasDismissedWelcome: false` and assert:

```ts
const dialog = page.getByRole("dialog");
await expect(dialog).toBeVisible();
await expect(dialog.locator(".welcome-step")).toHaveCount(3);

const overflow = await page.evaluate(() => ({
  document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  dialog: document.querySelector(".welcome-modal")!.scrollWidth
    - document.querySelector(".welcome-modal")!.clientWidth,
}));

expect(overflow.document).toBeLessThanOrEqual(1);
expect(overflow.dialog).toBeLessThanOrEqual(1);
```

- [ ] **Step 3: Run the welcome E2E tests**

Run:

```powershell
npm run build:static
npx playwright test tests/e2e/static-html-page.spec.ts --config=playwright.static.config.ts --grep "welcome|mobile"
```

Expected: desktop and Pixel 7 checks PASS. Keep generated `dist-static` files unstaged until the release version is decided.

- [ ] **Step 4: Capture visual evidence**

Start the local static preview and capture one desktop and one Pixel 7 screenshot with Playwright. Inspect both images for:

- centered `1`, `2`, `3` markers;
- no three-card grid;
- no large empty vertical gaps;
- no overlap or horizontal overflow;
- relay link visibly subordinate to the setup action.

Store temporary screenshots under `test-results/welcome-preview/`; do not stage or commit them.

- [ ] **Step 5: Run the full verification set**

Run:

```powershell
npm run test:run
npm run build
npm run secret:scan
npx tsc --noEmit
```

Expected: all commands PASS. The release archive checks remain deferred because `v0.1.7` is immutable and this change has not yet been assigned `v0.1.8`.

- [ ] **Step 6: Update the design status**

Change the design document status to:

```markdown
**Status:** Implemented and locally verified; release version pending
```

Append the exact unit/E2E/build results and note that `v0.1.7` was not modified.

- [ ] **Step 7: Commit tests and evidence documentation**

```powershell
git add tests/e2e/static-html-page.spec.ts docs/superpowers/specs/2026-07-13-welcome-dialog-redesign-design.md
git commit -m "test: verify compact welcome dialog"
```

## Final Acceptance

- Present the current-source desktop and mobile previews to the user before any push.
- Do not stage or commit generated `dist-static` output under version `0.1.7`.
- After user approval, create a separate release plan for `v0.1.8` if the change should replace the GitHub Pages latest version.
