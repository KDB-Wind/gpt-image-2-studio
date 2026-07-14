# Welcome Dialog Redesign

**Date:** 2026-07-13  
**Status:** Implemented and locally verified; release version pending

## Problem

The current welcome dialog uses three equal-height cards. The first two cards contain little content while the third contains a dense checklist. Because each card is a stretched grid, the first two cards distribute their children across the full height and create large empty gaps. The result has no clear reading order and makes the optional relay recommendation as prominent as the required setup path.

## Goals

- Replace the three-card layout with one compact, vertically ordered onboarding flow.
- Make the required setup path immediately understandable to a first-time user.
- Keep the relay recommendation as a weak optional text link.
- Send users with incomplete configuration directly to Settings.
- Avoid sending returning, already-configured users back to Settings.
- Preserve Chinese and English copy, keyboard accessibility, mobile behavior, and the existing one-time welcome preference.

## Non-Goals

- No changes to image generation, batch generation, history, storage implementation, or provider request behavior.
- No new onboarding wizard, progress persistence, or multi-step modal.
- No change to the recommended relay URL.
- No automatic API or generation test from the welcome dialog.

## Approved Layout

Use the approved compact single-column layout:

1. Dialog title: the existing localized welcome title.
2. Short eyebrow: first-time setup only needs to be completed once.
3. One-sentence introduction.
4. A three-step preparation list:
   - Fill in Base URL, API key, text model, and image model.
   - Authorize a dedicated save directory and run the directory test.
   - Generate one single image before starting a batch.
5. A compact privacy note explaining that the API key stays on the current device and requests go only to the configured Base URL.
6. A weak optional relay text link below the privacy note.
7. Footer actions aligned with the existing dialog system.

The numbered step markers use a fixed square size, `display: flex`, centered alignment, zero padding, and `line-height: 1`. This prevents the numerals from appearing above or below the visual center.

## Interaction Rules

### Automatic display

The existing `hasDismissedWelcome` behavior remains authoritative. Once the welcome dialog is dismissed and that preference is persisted, it must not automatically appear on every visit.

### Setup completeness

For welcome-dialog routing, setup is complete only when:

- `validateConfig(config).errors` is empty; and
- the output directory state is `ready`.

Warnings do not make setup incomplete. A missing, untested, permission-required, or unsupported directory state keeps the setup action directed to Settings. Users can still explicitly choose the secondary dismiss action.

### Primary action

- Incomplete setup: label is localized as `前往设置` / `Go to settings`. Clicking it persists `hasDismissedWelcome: true`, closes the dialog, and switches the active tab to Settings.
- Complete setup: label is localized as `开始使用` / `Start using`. Clicking it persists `hasDismissedWelcome: true`, closes the dialog, and switches to the single-image tab.

### Secondary and close actions

The secondary action and close icon both persist the dismissed preference and close the dialog without forcing navigation. The secondary label should communicate deferral, such as `稍后设置` / `Set up later`, instead of presenting a competing primary path.

### Relay link

The relay recommendation appears only as an inline optional text link. It must not use a card, highlighted background, large button, or equal visual weight with setup actions.

## Responsive Behavior

- Desktop dialog width should be narrower than the current three-column wide modal and use a single content column.
- The dialog body may scroll within the viewport when height is constrained.
- On mobile, footer buttons use stable widths without forcing horizontal overflow.
- Text and step descriptions wrap naturally; the numbered circles remain fixed-size and do not shrink.

## Accessibility

- Preserve `role="dialog"`, `aria-modal`, localized accessible title, and the close button label.
- Use an ordered list or equivalent semantic structure for the three setup steps.
- Do not encode meaning using color alone.
- The relay link remains keyboard reachable and opens with the existing safe external-link behavior.

## Testing

Add or update tests to cover:

- The old three-card layout is no longer rendered.
- The dialog renders the three ordered setup steps and weak relay link.
- Incomplete setup uses the Settings action and changes the active tab after dismissal.
- Complete setup uses the Start action and returns to the single-image tab.
- Secondary dismissal persists the one-time welcome preference without forced navigation.
- Chinese and English labels are present.
- The numbered marker CSS has fixed dimensions, centered flex alignment, and `line-height: 1`.
- Desktop and Pixel 7 Playwright screenshots show no overflow, stretched cards, or overlapping content.

## Acceptance Criteria

- The welcome dialog matches approved option A.
- There are no three equal-height welcome cards or large empty vertical gaps.
- The optional relay recommendation is visually subordinate.
- Users with incomplete setup are routed to Settings.
- Users with complete setup are not forced back to Settings.
- The dialog remains a one-time automatic welcome experience.
- Step numbers are visibly centered in their circles on desktop and mobile.

## Local Verification

Verified on 2026-07-14 against the current source branch:

- Focused component and translation tests: 63 passed.
- Static welcome Playwright checks: 4 passed, 2 skipped by project targeting.
- Full Vitest suite: 33 test files passed, 506 tests passed.
- Production build: passed.
- TypeScript `--noEmit` check: passed.
- Secret scan: passed.
- Desktop Chrome screenshot: compact single-column dialog, three centered number markers, subordinate relay link, and no stretched cards.
- Pixel 7 screenshot: no horizontal overflow; the complete setup flow and both footer actions remain visible.

Temporary visual evidence is stored under `test-results/welcome-preview/` and is intentionally not committed. The immutable `static-versions/versions/v0.1.7/index.html` archive was not modified. Publishing this redesign remains a separate `v0.1.8` release decision after user acceptance.
