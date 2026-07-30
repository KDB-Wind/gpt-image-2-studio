# Batch Workflow B-lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the public static batch page with lightweight workflow actions, batch-level style lock, recovery controls, and copyable Prompt Recipe while preserving a path to a future full workflow builder.

**Architecture:** Keep the static HTML app backend-free. Add focused core helpers for workflow/style/recipe behavior, then wire them into `BatchPanel` without creating a separate workflow menu. Model recipe data as a small versioned object so a later visual workflow builder can reuse it.

**Tech Stack:** React, TypeScript, Vitest, Vite static build.

---

### Task 1: Core Workflow Helpers

**Files:**
- Create: `src/core/batchWorkflow.ts`
- Test: `src/core/batchWorkflow.test.ts`
- Modify: `src/core/batchTypes.ts`
- Modify: `src/core/batchPlanner.ts`
- Test: `src/core/batchPlanner.test.ts`

- [ ] Write failing tests for style lock prompt merging, task recovery filtering, and recipe generation.
- [ ] Add typed workflow concepts: `BatchWorkflowStep`, `BatchPromptRecipe`, and recipe schema version.
- [ ] Implement style-lock application as a pure function.
- [ ] Implement recovery helpers that select pending/failed tasks without selecting succeeded tasks.
- [ ] Implement recipe generation as a pure function that can later be serialized/imported by a full workflow builder.
- [ ] Run targeted core tests and verify the new tests fail before implementation, then pass after implementation.

### Task 2: Text Model Split Integration

**Files:**
- Modify: `src/core/batchPromptSplitter.ts`
- Test: `src/core/batchPromptSplitter.test.ts`

- [ ] Write a failing test showing style lock is passed into the text-model split prompt.
- [ ] Add optional `styleLock` to split input.
- [ ] Append style-lock requirements to the user prompt, not the custom system prompt, so user-provided split systems remain intact.
- [ ] Verify parsing behavior remains unchanged.

### Task 3: Batch Panel UI

**Files:**
- Modify: `src/components/BatchPanel.tsx`
- Test: `src/components/BatchPanel.test.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/styles.css`

- [ ] Write failing UI tests for style-lock field, workflow action strip, recipe copy panel, and continue/retry failed behavior.
- [ ] Add a compact workflow action strip inside the batch page.
- [ ] Add an optional batch-level style-lock field under the same-prompt master task.
- [ ] Apply style lock when creating repeated tasks and when accepting AI-split tasks.
- [ ] Add a recipe preview/copy panel generated from current batch settings.
- [ ] Add batch-level recovery buttons for continuing unfinished tasks and retrying failed tasks; keep successful tasks unchanged.
- [ ] Keep all copy bilingual and default Chinese.

### Task 4: Static Build Verification

**Files:**
- Modify generated: `dist-static/gpt-image-2-studio-lite.html`
- Modify generated: `dist-static/index.html`

- [ ] Run `npm run test:run`.
- [ ] Run `npm run build:static`.
- [ ] Run `npm run site:check`.
- [ ] Inspect `git status --short` and report changed files.

---

### Future C Builder Compatibility

The B-lite implementation must keep these extension seams:

- `BatchPromptRecipe.schemaVersion` for import/export compatibility.
- `BatchWorkflowStep` as a non-visual workflow model that can later map to nodes.
- Pure core helpers independent from React.
- UI actions should call helpers instead of embedding recipe/style/recovery logic in JSX.
