import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

import {
  ONE_PIXEL_PNG_BASE64,
  expectBatchHistoryContains,
  expectHistoryContains,
  installMockOutputDirectory,
  mockImageGeneration,
  openCleanStaticPage,
  readMockOutputDirectoryFile,
} from "./helpers/staticHtmlHarness";

const CONFIG_STORAGE_KEY = "chat-to-image.config.v1";
const SESSION_API_KEYS_STORAGE_KEY = "chat-to-image.api-keys.session.v1";

type SyntheticProviderProfile = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  imageResponseMode: "official" | "force-base64";
  rememberApiKey: boolean;
};

function createSyntheticProviderProfile(
  overrides: Partial<SyntheticProviderProfile> & Pick<SyntheticProviderProfile, "id" | "name">,
): SyntheticProviderProfile {
  return {
    baseUrl: `https://${overrides.id}.provider.test/v1`,
    apiKey: `${overrides.id}-synthetic-key`,
    textModel: `${overrides.id}-text-model`,
    imageModel: `${overrides.id}-image-model`,
    imageResponseMode: "official",
    rememberApiKey: false,
    ...overrides,
  };
}

type CapturedMultipartRequest = {
  fields: Record<string, string[]>;
  files: Array<{ fieldName: string; fileName: string; type: string; size: number }>;
};

async function readMultipartRequest(request: import("@playwright/test").Request): Promise<CapturedMultipartRequest> {
  const contentType = await request.headerValue("content-type");
  const body = request.postDataBuffer();
  expect(contentType).toContain("multipart/form-data; boundary=");
  expect(body).not.toBeNull();

  const formData = await new Response(body, { headers: { "content-type": contentType ?? "" } }).formData();
  const fields: Record<string, string[]> = {};
  const files: CapturedMultipartRequest["files"] = [];
  for (const [fieldName, value] of formData.entries()) {
    if (typeof value === "string") {
      fields[fieldName] = [...(fields[fieldName] ?? []), value];
    } else {
      files.push({ fieldName, fileName: value.name, type: value.type, size: value.size });
    }
  }
  return { fields, files };
}

test("static config keeps desktop and Pixel 7 mobile projects", async ({}, testInfo) => {
  expect(testInfo.config.projects.map((project) => project.name)).toEqual(
    expect.arrayContaining(["chromium", "chromium-pixel-7"]),
  );
});

test("static provider profiles migrate a legacy single config into the default profile", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(
    ({ configKey, sessionApiKeysKey }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(configKey, JSON.stringify({
        uiLanguage: "en-US",
        hasDismissedWelcome: true,
        baseUrl: "https://legacy.provider.test/v1",
        apiKey: "legacy-synthetic-key",
        rememberApiKey: false,
        textModel: "legacy-text-model",
        imageModel: "legacy-image-model",
        imageResponseMode: "force-base64",
      }));
      sessionStorage.removeItem(sessionApiKeysKey);
    },
    { configKey: CONFIG_STORAGE_KEY, sessionApiKeysKey: SESSION_API_KEYS_STORAGE_KEY },
  );
  await page.reload();

  await page.getByRole("tab", { name: "Settings" }).click();
  const profileSelect = page.getByTestId("settings-provider-profile");
  await expect(profileSelect).toHaveValue("provider-default");
  await expect(profileSelect.locator("option")).toHaveCount(1);
  await expect(profileSelect.locator("option")).toHaveText("Default provider");
  await expect(page.getByLabel("Profile name")).toHaveValue("Default provider");
  await expect(page.getByTestId("settings-base-url")).toHaveValue("https://legacy.provider.test/v1");
  await expect(page.getByTestId("settings-api-key")).toHaveValue("legacy-synthetic-key");
  await expect(page.getByTestId("settings-text-model")).toHaveValue("legacy-text-model");
  await expect(page.getByTestId("settings-image-model")).toHaveValue("legacy-image-model");
  await expect(page.locator(".profile-response-mode-field select")).toHaveValue("force-base64");

  const migratedStorage = await page.evaluate(
    ({ configKey, sessionApiKeysKey }) => ({
      config: JSON.parse(localStorage.getItem(configKey) ?? "{}"),
      sessionApiKeys: JSON.parse(sessionStorage.getItem(sessionApiKeysKey) ?? "{}"),
    }),
    { configKey: CONFIG_STORAGE_KEY, sessionApiKeysKey: SESSION_API_KEYS_STORAGE_KEY },
  );
  expect(migratedStorage.config).not.toHaveProperty("apiKey");
  expect(migratedStorage.config).toMatchObject({
    providerSchemaVersion: 1,
    activeProviderProfileId: "provider-default",
    providerProfiles: [{
      id: "provider-default",
      name: "Default provider",
      baseUrl: "https://legacy.provider.test/v1",
      textModel: "legacy-text-model",
      imageModel: "legacy-image-model",
      imageResponseMode: "force-base64",
      rememberApiKey: false,
    }],
  });
  expect(migratedStorage.sessionApiKeys).toEqual({ "provider-default": "legacy-synthetic-key" });
});

test("static provider profiles isolate provider settings and persist the active quick selection", async ({ page }) => {
  const alpha = createSyntheticProviderProfile({ id: "alpha", name: "Synthetic Alpha" });
  const beta = createSyntheticProviderProfile({
    id: "beta",
    name: "Synthetic Beta",
    imageResponseMode: "force-base64",
  });
  const providerRequests: Array<{
    provider: string;
    authorization: string | null;
    body: Record<string, unknown>;
  }> = [];

  for (const profile of [alpha, beta]) {
    await page.route(`${profile.baseUrl}/images/generations`, async (route) => {
      providerRequests.push({
        provider: profile.id,
        authorization: await route.request().headerValue("authorization"),
        body: route.request().postDataJSON() as Record<string, unknown>,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }] }),
      });
    });
  }

  await openCleanStaticPage(page, {
    uiLanguage: "en-US",
    providerSchemaVersion: 1,
    activeProviderProfileId: alpha.id,
    providerProfiles: [alpha, beta],
    baseUrl: alpha.baseUrl,
    apiKey: alpha.apiKey,
    textModel: alpha.textModel,
    imageModel: alpha.imageModel,
    imageResponseMode: alpha.imageResponseMode,
  });

  const singleProfileSelect = page.getByTestId("single-provider-profile");
  await expect(singleProfileSelect).toHaveValue(alpha.id);
  await page.getByTestId("single-prompt").fill("Generate with synthetic alpha");
  await page.getByTestId("single-generate").click();
  await expect.poll(() => providerRequests.length).toBe(1);

  await singleProfileSelect.selectOption(beta.id);
  await expect(singleProfileSelect).toHaveValue(beta.id);
  await expect(singleProfileSelect.locator("xpath=../..").locator(".provider-response-mode")).toHaveText("Force base64");
  await page.getByTestId("single-prompt").fill("Generate with synthetic beta");
  await page.getByTestId("single-generate").click();
  await expect.poll(() => providerRequests.length).toBe(2);

  expect(providerRequests).toEqual([
    {
      provider: alpha.id,
      authorization: `Bearer ${alpha.apiKey}`,
      body: expect.objectContaining({ model: alpha.imageModel }),
    },
    {
      provider: beta.id,
      authorization: `Bearer ${beta.apiKey}`,
      body: expect.objectContaining({ model: beta.imageModel, response_format: "b64_json" }),
    },
  ]);
  expect(providerRequests[0].body).not.toHaveProperty("response_format");

  await page.getByRole("tab", { name: "Settings" }).click();
  const settingsProfileSelect = page.getByTestId("settings-provider-profile");
  await expect(settingsProfileSelect).toHaveValue(beta.id);
  await expect(page.getByTestId("settings-base-url")).toHaveValue(beta.baseUrl);
  await expect(page.getByTestId("settings-api-key")).toHaveValue(beta.apiKey);
  await expect(page.getByTestId("settings-text-model")).toHaveValue(beta.textModel);
  await expect(page.getByTestId("settings-image-model")).toHaveValue(beta.imageModel);
  await expect(page.locator(".profile-response-mode-field select")).toHaveValue(beta.imageResponseMode);

  await settingsProfileSelect.selectOption(alpha.id);
  await expect(page.getByTestId("settings-base-url")).toHaveValue(alpha.baseUrl);
  await expect(page.getByTestId("settings-api-key")).toHaveValue(alpha.apiKey);
  await expect(page.getByTestId("settings-text-model")).toHaveValue(alpha.textModel);
  await expect(page.getByTestId("settings-image-model")).toHaveValue(alpha.imageModel);
  await expect(page.locator(".profile-response-mode-field select")).toHaveValue(alpha.imageResponseMode);

  await settingsProfileSelect.selectOption(beta.id);
  await expect.poll(() => page.evaluate(
    (configKey) => JSON.parse(localStorage.getItem(configKey) ?? "{}").activeProviderProfileId,
    CONFIG_STORAGE_KEY,
  )).toBe(beta.id);
  await page.reload();

  await expect(page.getByTestId("single-provider-profile")).toHaveValue(beta.id);
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByTestId("settings-provider-profile")).toHaveValue(beta.id);
  await expect(page.getByTestId("settings-base-url")).toHaveValue(beta.baseUrl);
  await expect(page.getByTestId("settings-api-key")).toHaveValue(beta.apiKey);
  await expect(page.getByTestId("settings-text-model")).toHaveValue(beta.textModel);
  await expect(page.getByTestId("settings-image-model")).toHaveValue(beta.imageModel);
  await expect(page.locator(".profile-response-mode-field select")).toHaveValue(beta.imageResponseMode);
});

test("static Single CORS URL failure offers force-base64 without another provider call", async ({ page }) => {
  const profile = createSyntheticProviderProfile({ id: "single-cors", name: "Single CORS Profile" });
  let providerCalls = 0;
  await page.route(`${profile.baseUrl}/images/generations`, async (route) => {
    providerCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ url: "https://single-cors-assets.test/generated.png" }] }),
    });
  });
  await page.route("https://single-cors-assets.test/generated.png", (route) => route.abort("failed"));
  await openCleanStaticPage(page, {
    uiLanguage: "en-US",
    providerSchemaVersion: 1,
    activeProviderProfileId: profile.id,
    providerProfiles: [profile],
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    textModel: profile.textModel,
    imageModel: profile.imageModel,
    imageResponseMode: profile.imageResponseMode,
  });

  await page.getByTestId("single-prompt").fill("Generate one synthetic CORS response");
  await page.getByTestId("single-generate").click();
  const forceBase64Action = page.getByTestId("single-force-base64");
  await expect(forceBase64Action).toHaveText("Switch to force base64");
  expect(providerCalls).toBe(1);

  await forceBase64Action.click();
  await expect(forceBase64Action).toHaveCount(0);
  await expect(page.getByText("The current provider profile now uses force base64. Generate again manually.")).toBeVisible();
  await expect.poll(() => page.evaluate(
    ({ configKey, profileId }) => {
      const stored = JSON.parse(localStorage.getItem(configKey) ?? "{}");
      return stored.providerProfiles?.find((candidate: { id?: string }) => candidate.id === profileId)?.imageResponseMode;
    },
    { configKey: CONFIG_STORAGE_KEY, profileId: profile.id },
  )).toBe("force-base64");
  await page.waitForTimeout(200);
  expect(providerCalls).toBe(1);
});

test("static Batch CORS pauses before remaining tasks and force-base64 does not rerun", async ({ page }) => {
  const profile = createSyntheticProviderProfile({ id: "batch-cors", name: "Batch CORS Profile" });
  let providerCalls = 0;
  await page.route(`${profile.baseUrl}/images/generations`, async (route) => {
    providerCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ url: "https://batch-cors-assets.test/generated.png" }] }),
    });
  });
  await page.route("https://batch-cors-assets.test/generated.png", (route) => route.abort("failed"));
  await openCleanStaticPage(page, {
    uiLanguage: "en-US",
    providerSchemaVersion: 1,
    activeProviderProfileId: profile.id,
    providerProfiles: [profile],
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    textModel: profile.textModel,
    imageModel: profile.imageModel,
    imageResponseMode: profile.imageResponseMode,
    batchDefaultTaskCount: 2,
    batchDefaultConcurrency: 1,
  });

  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("First synthetic CORS batch task");
  await page.getByTestId("batch-custom-prompt-1").fill("Second task must remain pending");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByTestId("batch-start").click();

  const forceBase64Action = page.getByTestId("batch-force-base64");
  await expect(forceBase64Action).toHaveText("Switch to force base64");
  await expect(page.locator(".batch-task-list .status-pill.failed")).toHaveCount(1);
  await expect(page.locator(".batch-task-list .status-pill.pending")).toHaveCount(1);
  expect(providerCalls).toBe(1);

  await forceBase64Action.click();
  await expect(forceBase64Action).toHaveCount(0);
  await expect(page.getByText("The current provider profile now uses force base64. Generate again manually.")).toBeVisible();
  await expect(page.locator(".batch-task-list .status-pill.failed")).toHaveCount(1);
  await expect(page.locator(".batch-task-list .status-pill.pending")).toHaveCount(1);
  await page.waitForTimeout(200);
  expect(providerCalls).toBe(1);
});

test("@mobile provider quick selectors with long profile names do not overflow Pixel 7", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Pixel 7 coverage runs in the mobile project.");
  const alpha = createSyntheticProviderProfile({
    id: "mobile-alpha",
    name: "Synthetic Alpha Provider Profile With A Deliberately Very Long Display Name For Mobile Coverage",
  });
  const beta = createSyntheticProviderProfile({
    id: "mobile-beta",
    name: "Synthetic Beta Provider Profile With Another Deliberately Very Long Display Name For Mobile Coverage",
    imageResponseMode: "force-base64",
  });
  await openCleanStaticPage(page, {
    uiLanguage: "en-US",
    providerSchemaVersion: 1,
    activeProviderProfileId: alpha.id,
    providerProfiles: [alpha, beta],
    baseUrl: alpha.baseUrl,
    apiKey: alpha.apiKey,
    textModel: alpha.textModel,
    imageModel: alpha.imageModel,
    imageResponseMode: alpha.imageResponseMode,
  });

  const expectQuickSelectorFits = async (testId: string) => {
    await expect(page.getByTestId(testId)).toBeVisible();
    const measurements = await page.getByTestId(testId).evaluate((select) => {
      const quickSwitcher = select.closest<HTMLElement>(".provider-quick-switcher");
      const rect = select.getBoundingClientRect();
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        switcherOverflow: quickSwitcher ? quickSwitcher.scrollWidth - quickSwitcher.clientWidth : Number.POSITIVE_INFINITY,
        left: rect.left,
        right: rect.right,
        viewportWidth: window.innerWidth,
      };
    });
    expect(measurements.documentOverflow).toBeLessThanOrEqual(1);
    expect(measurements.switcherOverflow).toBeLessThanOrEqual(1);
    expect(measurements.left).toBeGreaterThanOrEqual(0);
    expect(measurements.right).toBeLessThanOrEqual(measurements.viewportWidth + 1);
  };

  await expectQuickSelectorFits("single-provider-profile");
  await page.getByTestId("single-provider-profile").selectOption(beta.id);
  await expect(
    page.getByTestId("single-provider-profile").locator("xpath=../..").locator(".provider-response-mode"),
  ).toHaveText("Force base64");
  await expectQuickSelectorFits("single-provider-profile");

  await page.getByRole("tab", { name: "Batch" }).click();
  await expect(page.getByTestId("batch-provider-profile")).toHaveValue(beta.id);
  await expectQuickSelectorFits("batch-provider-profile");
});

test("compact welcome routes incomplete setup to Settings", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop welcome behavior is covered by the Chromium project.");
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

test("@mobile compact welcome fits Pixel 7 without horizontal overflow", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Pixel 7 coverage runs in the mobile project.");
  await openCleanStaticPage(page, {
    uiLanguage: "en-US",
    apiKey: "",
    hasDismissedWelcome: false,
  });

  const dialog = page.getByRole("dialog", { name: "Welcome to Local Image Studio" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".welcome-step")).toHaveCount(3);

  const overflow = await page.evaluate(() => {
    const welcomeDialog = document.querySelector<HTMLElement>(".welcome-modal");
    if (!welcomeDialog) {
      throw new Error("Welcome dialog was not rendered.");
    }

    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dialog: welcomeDialog.scrollWidth - welcomeDialog.clientWidth,
    };
  });

  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.dialog).toBeLessThanOrEqual(1);
});

test("static page generates one image, shows preview, and writes history", async ({ page }) => {
  await mockImageGeneration(page);
  await openCleanStaticPage(page);

  await page.getByRole("tab", { name: "单图" }).click();
  await page.getByTestId("single-prompt").fill("生成一张极简风格的蓝色小猫贴纸");
  await page.getByTestId("single-generate").click();

  await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("已保存图片")).toBeVisible();
  await expectHistoryContains(page, "蓝色小猫");
});

test("static page runs a custom two-prompt batch, shows previews, and writes history", async ({ page }) => {
  await mockImageGeneration(page);
  await openCleanStaticPage(page);

  await page.getByRole("tab", { name: "批量" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("生成一张红色机器人图标");
  await page.getByTestId("batch-custom-prompt-1").fill("生成一张绿色飞船图标");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByTestId("batch-start").click();

  await expect(page.getByText(/批量完成：成功 2，失败 0，跳过 0。/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".preview-panel figure img")).toHaveCount(2);
  await expectBatchHistoryContains(page, "batch-images", "红色机器人");
  await expectBatchHistoryContains(page, "batch-images", "绿色飞船");
});

test("static single-task retry moves failed to succeeded without duplicate calls or history", async ({ page }) => {
  let providerCalls = 0;
  let releaseRetryResponse!: () => void;
  const retryResponseBarrier = new Promise<void>((resolve) => {
    releaseRetryResponse = resolve;
  });
  await page.route("**/images/generations", async (route) => {
    providerCalls += 1;
    if (providerCalls === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Mock validation failure." } }),
      });
      return;
    }

    await retryResponseBarrier;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }] }),
    });
  });
  await installMockOutputDirectory(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US", batchDefaultTaskCount: 1 });

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Choose and authorize folder" }).click();
  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByLabel("Batch title").fill("retry-history-batch");
  await page.getByTestId("batch-custom-prompt-0").fill("Create one retryable poster");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByTestId("batch-start").click();

  const retryButton = page.getByRole("button", { name: "Retry this task" });
  await expect(retryButton).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".batch-task-list .status-pill.failed")).toHaveCount(1);
  await retryButton.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await expect.poll(() => providerCalls).toBe(2);
  await expect(page.getByTestId("batch-start")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry failed tasks" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Clear current batch" })).toBeDisabled();
  await expect(page.locator(".batch-task-card .batch-task-prompt-textarea")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pause" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel remaining" })).toBeDisabled();

  releaseRetryResponse();
  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(1, { timeout: 30_000 });
  expect(providerCalls).toBe(2);

  const manifestText = await readMockOutputDirectoryFile(page, "manifest.json");
  expect(manifestText).not.toBeNull();
  const manifest = JSON.parse(manifestText ?? "{}") as {
    tasks: Array<{ status: string; prompt: string }>;
  };
  expect(manifest.tasks).toEqual([
    expect.objectContaining({ status: "succeeded", prompt: "Create one retryable poster" }),
  ]);

  await page.getByRole("tab", { name: "History" }).click();
  const batchHistory = page.getByRole("article").filter({ hasText: "retry-history-batch" }).first();
  await expect(batchHistory).toBeVisible();
  const expandButton = batchHistory.getByRole("button", { name: "Expand batch" });
  if (await expandButton.isVisible()) {
    await expandButton.click();
  }
  await expect(batchHistory.locator(".history-batch-task")).toHaveCount(1);
  await expect(batchHistory.locator(".history-batch-task")).toContainText("Create one retryable poster");
});

test("static batch sends global and task-specific references as repeated image fields", async ({ page }) => {
  const requests: CapturedMultipartRequest[] = [];
  await page.route("**/images/edits", async (route) => {
    requests.push(await readMultipartRequest(route.request()));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }] }),
    });
  });
  await openCleanStaticPage(page, { uiLanguage: "en-US", batchDefaultTaskCount: 2 });

  await page.getByRole("tab", { name: "Batch" }).click();
  await page.locator("details.batch-reference-section").evaluate((details: HTMLDetailsElement) => {
    details.open = true;
    details.dispatchEvent(new Event("toggle", { bubbles: true }));
  });
  await page.getByLabel("Batch reference images (image-to-image)").setInputFiles({
    name: "global-reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
  });
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("Reference task alpha");
  await page.getByTestId("batch-custom-prompt-1").fill("Reference task beta");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByRole("button", { name: "Expand all task references" }).click();
  await page.getByLabel("Task 1 reference images").setInputFiles({
    name: "alpha-only.png",
    mimeType: "image/png",
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
  });
  await page.getByLabel("Task 2 reference images").setInputFiles([
    {
      name: "beta-one.png",
      mimeType: "image/png",
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    },
    {
      name: "beta-two.png",
      mimeType: "image/png",
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    },
  ]);
  await page.getByTestId("batch-start").click();
  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(2, { timeout: 60_000 });

  expect(requests).toHaveLength(2);
  const requestsByPrompt = Object.fromEntries(requests.map((request) => [request.fields.prompt?.[0], request]));
  expect(requestsByPrompt["Reference task alpha"].files).toEqual([
    expect.objectContaining({ fieldName: "image", fileName: "global-reference.png" }),
    expect.objectContaining({ fieldName: "image", fileName: "alpha-only.png" }),
  ]);
  expect(requestsByPrompt["Reference task beta"].files).toEqual([
    expect.objectContaining({ fieldName: "image", fileName: "global-reference.png" }),
    expect.objectContaining({ fieldName: "image", fileName: "beta-one.png" }),
    expect.objectContaining({ fieldName: "image", fileName: "beta-two.png" }),
  ]);
  expect(requests.flatMap((request) => request.files.map((file) => file.fieldName))).not.toContain("image[]");
});

test("static batch restores its master task, child prompts, count, and statuses after reload", async ({ page }) => {
  await mockImageGeneration(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US", batchDefaultTaskCount: 2 });

  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByLabel("Master task").fill("Create a two-poster launch campaign");
  await page.getByTestId("batch-create-tasks").click();
  const childPrompts = page.locator(".batch-task-list .batch-task-prompt-textarea");
  await childPrompts.nth(0).fill("Launch poster alpha");
  await childPrompts.nth(1).fill("Launch poster beta");
  await page.getByTestId("batch-start").click();
  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(2, { timeout: 60_000 });

  await page.reload();
  await page.getByRole("tab", { name: "Batch" }).click();
  await expect(page.getByLabel("Master task")).toHaveValue("Create a two-poster launch campaign");
  await expect(page.getByLabel("Task count")).toHaveValue("2");
  const restoredChildPrompts = page.locator(".batch-task-list .batch-task-prompt-textarea");
  await expect(restoredChildPrompts).toHaveCount(2);
  await expect(restoredChildPrompts.nth(0)).toHaveValue("Launch poster alpha");
  await expect(restoredChildPrompts.nth(1)).toHaveValue("Launch poster beta");
  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(2);
});

test("@mobile static workspaces avoid horizontal overflow and keep primary controls usable", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Pixel 7 coverage runs in the mobile project.");
  await mockImageGeneration(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US", batchDefaultTaskCount: 1 });

  const expectNoHorizontalOverflow = async () => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  };

  await page.getByRole("tab", { name: "Single image" }).click();
  await expect(page.getByTestId("single-prompt")).toBeVisible();
  await page.getByTestId("single-prompt").fill("Mobile single prompt");
  await expect(page.getByTestId("single-generate")).toBeVisible();
  await page.getByTestId("single-generate").click();
  await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalOverflow();

  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("Mobile batch prompt");
  await page.getByTestId("batch-create-tasks").click();
  await expect(page.getByTestId("batch-start")).toBeVisible();
  await expect(page.getByTestId("batch-start")).toBeEnabled();
  await expectNoHorizontalOverflow();

  await page.getByRole("tab", { name: "History" }).click();
  const viewHistory = page.getByRole("button", { name: "Inspect" }).first();
  await expect(viewHistory).toBeVisible();
  await expect(viewHistory).toBeEnabled();
  await viewHistory.click();
  await expect(page.locator("article.history-item.selected")).toContainText("Mobile single prompt");
  await expectNoHorizontalOverflow();

  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByTestId("settings-save")).toBeVisible();
  await expect(page.getByTestId("settings-save")).toBeEnabled();
  await page.getByTestId("settings-save").click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expectNoHorizontalOverflow();
});

test("static batch preserves browser-download fallbacks in its summary and manifest", async ({ page }) => {
  await installMockOutputDirectory(page, {
    failImageWrites: true,
    writeError: "permission denied https://provider.example/image.png?token=private-token",
  });
  await mockImageGeneration(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US" });

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Choose and authorize folder" }).click();
  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("Create a red robot icon");
  await page.getByTestId("batch-custom-prompt-1").fill("Create a green rocket icon");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByTestId("batch-start").click();

  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByTestId("batch-save-summary")).toHaveText(
    "Generated successfully 2, saved to authorized directory 0, fell back to browser download 2, history available only in this session 0.",
  );
  await expect(page.locator('[data-testid^="batch-save-fallback-task-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="batch-save-fallback-task-"]').first()).toContainText("[redacted-url]");
  await expect(page.locator('[data-testid^="batch-save-fallback-task-"]').first()).not.toContainText("private-token");

  const manifestText = await readMockOutputDirectoryFile(page, "manifest.json");
  expect(manifestText).not.toBeNull();
  const manifest = JSON.parse(manifestText ?? "{}") as {
    tasks: Array<{ status: string; saveMode?: string; saveFallbackReason?: string }>;
  };
  expect(manifest.tasks).toHaveLength(2);
  expect(manifest.tasks[0]).toMatchObject({
    status: "succeeded",
    saveMode: "browser-download",
    saveFallbackReason: expect.stringContaining("[redacted-url]"),
  });
  expect(manifest.tasks[1]).toMatchObject({
    status: "succeeded",
    saveMode: "browser-download",
    saveFallbackReason: expect.stringContaining("[redacted-url]"),
  });
  expect(JSON.stringify(manifest)).not.toContain("private-token");
});

test("static batch records authorized-directory saves in its summary and manifest", async ({ page }) => {
  await installMockOutputDirectory(page);
  await mockImageGeneration(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US" });

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Choose and authorize folder" }).click();
  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("Create a blue globe icon");
  await page.getByTestId("batch-custom-prompt-1").fill("Create a yellow sun icon");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByTestId("batch-start").click();

  await expect(page.getByTestId("batch-save-summary")).toHaveText(
    "Generated successfully 2, saved to authorized directory 2, fell back to browser download 0, history available only in this session 0.",
    { timeout: 60_000 },
  );

  const manifestText = await readMockOutputDirectoryFile(page, "manifest.json");
  expect(manifestText).not.toBeNull();
  const manifest = JSON.parse(manifestText ?? "{}") as { tasks: Array<{ saveMode?: string; saveFallbackReason?: string }> };
  expect(manifest.tasks).toHaveLength(2);
  expect(manifest.tasks[0]).toMatchObject({ saveMode: "authorized-directory" });
  expect(manifest.tasks[1]).toMatchObject({ saveMode: "authorized-directory" });
  expect(manifest.tasks[0].saveFallbackReason).toBeUndefined();
  expect(manifest.tasks[1].saveFallbackReason).toBeUndefined();
});

test("static page verifies an authorized output folder and restores history preview after reauthorization", async ({
  page,
}) => {
  await installMockOutputDirectory(page);
  await mockImageGeneration(page);
  await openCleanStaticPage(page);

  await page.getByRole("tab", { name: "设置" }).click();
  await page.getByRole("button", { name: "选择并授权目录" }).click();
  await page.getByRole("button", { name: "测试保存目录" }).click();
  await expect(page.locator(".message-card").filter({ hasText: "保存目录测试通过" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("tab", { name: "单图" }).click();
  await page.getByTestId("single-prompt").fill("生成一张可恢复历史预览的橙色星星图标");
  await page.getByTestId("single-generate").click();

  await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("已保存到授权目录")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "设置" }).click();
  await page.getByRole("button", { name: "选择并授权目录" }).click();

  await page.getByRole("tab", { name: "历史" }).click();
  const historyRecord = page.getByRole("article").filter({ hasText: "橙色星星图标" }).first();
  await expect(historyRecord).toBeVisible();
  await historyRecord.getByRole("button", { name: "查看" }).click();

  await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/无法恢复这张历史图片预览/)).toHaveCount(0);
});
