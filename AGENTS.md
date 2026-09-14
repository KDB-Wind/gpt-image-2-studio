# Coding Agent Guide

## Runtime and safety

- Use Node.js `>=20.19.0`, npm `>=10.0.0`, and the committed npm lockfile.
- Never place a real API key in source, tests, logs, screenshots, commits, or handoffs.
- Do not run `e2e:static:real`, publish a release, deploy, or change branch protection unless the user explicitly authorizes the external effect.
- Preserve unrelated worktree changes. Do not rewrite generated release artifacts unless the task requires them.

## Required task record

Before editing, retain one recoverable task boundary:

- requested outcome and acceptance criteria;
- files or modules in scope;
- explicit exclusions and external effects;
- unresolved questions or blockers.

If scope expands materially, record why before editing the additional owner.

## Validation after the final change

Run the smallest relevant checks after the last material edit. A result from an earlier state does not validate the final state. If a validation failure causes another edit, rerun the failed check or document why an equivalent check covers the same behavior.

Use this change-to-check map:

- Provider profiles or settings persistence (`src/core/providerProfiles*`, profile UI in `src/App*`): run `npx vitest run src/core/providerProfiles.test.ts src/App.test.tsx`, then `npm run build`.
- Web runtime adapter (`src/runtime/webAdapter*`): run `npx vitest run src/runtime/webAdapter.test.ts`, then `npm run build`.
- Tauri runtime adapter (`src/runtime/tauriAdapter*`): run `npx vitest run src/runtime/tauriAdapter.test.ts`, then `npm run build`. For Rust-side changes, also run `cargo check --manifest-path src-tauri/Cargo.toml` and the relevant Rust tests.
- Batch execution (`src/core/batchRunner*`): run `npx vitest run src/core/batchRunner.test.ts`, then `npm run build`.
- Broad frontend behavior or shared contracts: run `npm run test:run` and `npm run build`.
- Static-site or release behavior: run the affected focused checks from `package.json`; use `npm run site:verify` for static-site changes and `npm run release:check` for release-readiness changes.

Do not use `git diff --check` as behavioral validation. It may supplement, but never replace, the relevant test and build route.

## Handoff contract

End implementation work with exactly one status: `DONE` or `BLOCKED`.

Include:

- outcome delivered, or the precise blocker;
- changed files and any approved scope expansion;
- final validation commands and pass/fail results, all run after the final material edit;
- current commit SHA when a commit exists; otherwise state `uncommitted`;
- remaining risks or skipped checks with reasons;
- delivery state, using only one of: `local only`, `CI pending`, `CI passed`, `merged`, or `released`.

Local validation is not CI, merge, deployment, or release acceptance. Claim `CI passed`, `merged`, or `released` only when the corresponding external result for the current revision was actually inspected. If it was not inspected, report `CI pending` or `local only`.
