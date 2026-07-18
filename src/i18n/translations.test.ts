import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANGUAGE,
  getTranslations,
  isSupportedLanguage,
  resolveLanguage,
  type UiLanguage,
} from "./translations";

describe("resolveLanguage", () => {
  it("defaults to Simplified Chinese when no saved language is available", () => {
    expect(resolveLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage("")).toBe(DEFAULT_LANGUAGE);
  });

  it("keeps supported language values", () => {
    expect(resolveLanguage("zh-CN")).toBe("zh-CN");
    expect(resolveLanguage("en-US")).toBe("en-US");
  });

  it("rejects unsupported language values", () => {
    expect(resolveLanguage("ja-JP")).toBe(DEFAULT_LANGUAGE);
  });
});

describe("isSupportedLanguage", () => {
  it("accepts only the two bundled languages", () => {
    expect(isSupportedLanguage("zh-CN")).toBe(true);
    expect(isSupportedLanguage("en-US")).toBe(true);
    expect(isSupportedLanguage("zh-TW")).toBe(false);
  });
});

describe("getTranslations", () => {
  it("returns the bundled Chinese copy by default", () => {
    expect(getTranslations("zh-CN").app.title).toBe("本地生图工作台");
  });

  it("returns the bundled English copy when requested", () => {
    expect(getTranslations("en-US").actions.generate).toBe("Generate image");
  });

  it("includes multi-image copy in both languages", () => {
    expect(getTranslations("zh-CN").actions.clearImages).toBe("清空全部");
    expect(getTranslations("en-US").notes.referenceImageLimitHint).toContain("8");
  });

  it("includes image-to-image copy in both languages", () => {
    expect(getTranslations("zh-CN").actions.testImageEdit).toBe("测试图生图");
    expect(getTranslations("en-US").modes.imageToImage).toBe("Image to image");
  });

  it("includes the new image output settings copy", () => {
    expect(getTranslations("zh-CN").fields.defaultSize).toBe("默认尺寸");
    expect(getTranslations("en-US").options.size4kLandscape).toContain("3840x2160");
    expect(getTranslations("en-US").fields.defaultCompression).toBe("Default compression");
  });

  it("includes the documented total-pixel validation message in both languages", () => {
    expect(
      getTranslations("zh-CN").validation["Image size must contain between 655,360 and 8,294,400 total pixels."],
    ).toBe("图片总像素必须在 655,360 到 8,294,400 之间。");
    expect(
      getTranslations("en-US").validation["Image size must contain between 655,360 and 8,294,400 total pixels."],
    ).toBe("Image size must contain between 655,360 and 8,294,400 total pixels.");
  });

  it("can be indexed by the shared UiLanguage type", () => {
    const language: UiLanguage = "en-US";
    expect(getTranslations(language).tabs.settings).toBe("Settings");
  });

  it("contains batch workspace copy in both languages", () => {
    const zh = getTranslations("zh-CN");
    const en = getTranslations("en-US");

    expect(zh.tabs.batch).toBe("批量");
    expect(zh.batch.title).toBe("批量生图");
    expect(zh.batch.sources.samePrompt).toBe("同一提示词生成多张");
    expect(zh.batch.sources.customPrompts).toBe("自定义多条提示词");
    expect(en.tabs.batch).toBe("Batch");
    expect(en.batch.title).toBe("Batch generation");
    expect(en.batch.sources.customPrompts).toBe("Custom multiple prompts");
  });

  it("contains batch execution actions and safety warnings", () => {
    const zh = getTranslations("zh-CN");
    const en = getTranslations("en-US");

    expect(zh.batch.actions.start.length).toBeGreaterThan(0);
    expect(zh.batch.actions.pause.length).toBeGreaterThan(0);
    expect(zh.batch.actions.cancel.length).toBeGreaterThan(0);
    expect(zh.batch.actions.retryTask.length).toBeGreaterThan(0);
    expect(zh.batch.emptyTasks.length).toBeGreaterThan(0);
    expect(zh.batch.messages.costRiskPaused.length).toBeGreaterThan(0);

    expect(en.batch.actions.start).toBe("Start batch");
    expect(en.batch.actions.retryTask).toBe("Retry this task");
    expect(en.batch.emptyTasks).toContain("Create tasks");
    expect(en.batch.messages.costRiskPaused).toContain("provider");
  });

  it("contains batch defaults and custom prompt copy", () => {
    const zh = getTranslations("zh-CN");
    const en = getTranslations("en-US");

    expect(zh.batch.defaultsNote.length).toBeGreaterThan(0);
    expect(zh.batch.fields.customPrompt(2)).toBe("提示词 2");
    expect(zh.batch.messages.maxTaskCountWarning(20)).toContain("20");
    expect(en.batch.defaultsNote).toContain("Save settings");
    expect(en.batch.fields.customPrompt(2)).toBe("Prompt 2");
    expect(en.batch.messages.maxTaskCountWarning(20)).toContain("20");
  });

  it("defines the compact three-step welcome contract in both languages", () => {
    const zh = getTranslations("zh-CN");
    const en = getTranslations("en-US");

    expect(Object.keys(zh.welcome)).toEqual([
      "title",
      "eyebrow",
      "intro",
      "setupTitle",
      "setupSteps",
      "privacyNote",
      "relayPrompt",
    ]);
    expect(Object.keys(en.welcome)).toEqual(Object.keys(zh.welcome));
    expect(zh.welcome.setupSteps).toHaveLength(3);
    expect(en.welcome.setupSteps).toHaveLength(3);
    expect(zh.welcome.setupSteps.every((step) => step.title.length > 0 && step.body.length > 0)).toBe(true);
    expect(en.welcome.setupSteps.every((step) => step.title.length > 0 && step.body.length > 0)).toBe(true);
  });

  it("includes the welcome action labels and Base URL privacy note in both languages", () => {
    const zh = getTranslations("zh-CN");
    const en = getTranslations("en-US");

    expect(zh.actions.goToSettings).toBe("前往设置");
    expect(zh.actions.startUsing).toBe("开始使用");
    expect(zh.actions.setUpLater).toBe("稍后设置");
    expect(en.actions.goToSettings).toBe("Go to settings");
    expect(en.actions.startUsing).toBe("Start using");
    expect(en.actions.setUpLater).toBe("Set up later");
    expect(zh.welcome.privacyNote).toContain("Base URL");
    expect(en.welcome.privacyNote).toContain("Base URL");
  });

  it("includes generic provider profile management copy in both languages", () => {
    const zh = getTranslations("zh-CN");
    const en = getTranslations("en-US");

    expect(zh.sections.providerProfiles).toBe("供应商档案");
    expect(zh.actions.createProviderProfile).toBe("新建档案");
    expect(zh.actions.deleteProviderProfile).toBe("删除档案");
    expect(en.sections.providerProfiles).toBe("Provider profiles");
    expect(en.fields.providerProfileName).toBe("Profile name");
    expect(en.notes.providerProfileLimit).toContain("20");
    expect(en.options.imageResponseModeOfficial).toBe("Official URL mode");
    expect(en.options.imageResponseModeForceBase64).toBe("Force base64");
    expect(en.notes.imageResponseModeHint).not.toMatch(/OpenAI|GPT|relay/i);
  });
});
