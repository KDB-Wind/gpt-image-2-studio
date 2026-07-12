# Static Site Hosting Guide

This guide explains how to publish the basic GPT-Image-2 Studio tool as a static website. The static site ships only frontend files. It does not include registration, payments, hosted keys, backend proxying, or server-side image storage.

## Recommended Option

Use GitHub Pages first:

- It fits an open-source repository.
- It does not require a server.
- It can build and deploy through GitHub Actions.
- Users can inspect the source and verify that no maintainer `API key` is bundled.

Cloudflare Pages is a good later option if you want a custom domain or stronger global edge performance.

## User Model

The static site uses BYOK, Bring Your Own Key:

- Users enter their own `API key`.
- Users enter their own `Base URL`.
- Settings stay in the user's browser local storage.
- The browser sends requests directly to the model provider entered by the user.
- This project does not host, proxy, or record user keys.

Different users visiting the same site have separate browser storage. One user cannot use another user's key unless they share the same browser profile or expose their key.

## GitHub Pages Flow

1. Confirm the public repository contains only the basic tool, not private platform backend code.
2. Merge changes into `main`.
3. Open the GitHub repository Settings.
4. Open Pages.
5. Set Source to `GitHub Actions`.
6. Push `main` and wait for `.github/workflows/pages.yml`.
7. Open:

```text
https://kdb-wind.github.io/gpt-image-2-studio/
```

## Local Verification

Run before publishing:

```powershell
npm run release:check
npm run test:run
npm run site:verify
```

What these commands do:

- `release:check` checks release files, workflows, and secret patterns.
- `test:run` runs frontend tests.
- `site:verify` builds `dist-static` and checks the hosted `index.html`, offline HTML, and secret scan.

## CORS Verification

Whether the static site can call an image model directly depends on the provider's browser CORS policy.

Test the recommended relay with:

```powershell
$env:BASE_URL = "<PROVIDER_BASE_URL>"
$env:SITE_ORIGIN = "https://kdb-wind.github.io"
npm run cors:check
```

A passing result looks like:

```text
Status: 204
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: *
CORS preflight check passed.
```

If CORS fails, the browser blocks the request. The realistic options are:

- Use a provider that supports browser CORS.
- Use the Windows desktop app.
- Deploy your own backend proxy, with the added server cost and key-safety responsibility.

## API Key Safety Boundary

A public static site is acceptable only if:

- No real `API key` is hardcoded in HTML or source.
- Users enter their own keys in their own browser.
- No third-party analytics, ads, or remote JavaScript are added.
- Secret scanning is run before every release.

Tell users:

- Do not save keys on shared computers.
- Do not post screenshots containing keys.
- Use the offline HTML if they do not want future hosted-page updates to run under the same site origin.

## Post-Deploy Acceptance

1. Open the GitHub Pages URL.
2. Confirm the app loads.
3. Search page source for `sk-`.
4. Enter a test `API key` and `Base URL`.
5. Test the text model.
6. Test the image model.
7. Generate one small image.
8. Refresh and confirm settings persist locally.
9. Open an incognito window and confirm the normal-window key is not present.
10. In browser Network, confirm requests go directly to the user-entered `Base URL`.

## Relation to Offline HTML

GitHub Pages publishes:

```text
dist-static/index.html
```

GitHub Release attaches:

```text
dist-static/gpt-image-2-studio-lite.html
```

The two files have the same content but different names:

- `index.html` is for the hosted static-site root.
- `gpt-image-2-studio-lite.html` is for users to download and double-click.
