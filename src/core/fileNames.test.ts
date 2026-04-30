import { describe, expect, it } from "vitest";
import {
  buildImageFileName,
  buildOutputPath,
  sanitizeFileBaseName,
  summarizePrompt,
} from "./fileNames";

describe("sanitizeFileBaseName", () => {
  it("removes forbidden cross-platform filename characters", () => {
    expect(sanitizeFileBaseName('  Summer: Road?/Shot*<1>|"  ')).toBe("summer-road-shot-1");
  });

  it("falls back to image when empty", () => {
    expect(sanitizeFileBaseName('  <>:"/\\|?*  ')).toBe("image");
  });
});

describe("summarizePrompt", () => {
  it("creates a short lowercase slug", () => {
    expect(summarizePrompt("A Cinematic Sunset Over Neon City")).toBe("a-cinematic-sunset-over-neon-city");
  });

  it("limits to 8 terms", () => {
    expect(
      summarizePrompt("one two three four five six seven eight nine ten"),
    ).toBe("one-two-three-four-five-six-seven-eight");
  });
});

describe("buildImageFileName", () => {
  const generatedAt = new Date("2026-05-01T09:08:07");

  it("uses custom names when present", () => {
    expect(
      buildImageFileName({
        customName: "  My Final Render  ",
        prompt: "ignored prompt",
        generatedAt,
        format: "png",
        existingFileNames: [],
      }),
    ).toBe("my-final-render.png");
  });

  it("uses time + prompt summary when custom name empty", () => {
    expect(
      buildImageFileName({
        customName: "   ",
        prompt: "Glowing forest spirits at dawn",
        generatedAt,
        format: "jpeg",
        existingFileNames: [],
      }),
    ).toBe("09-08-07_glowing-forest-spirits-at-dawn.jpg");
  });

  it("adds numeric suffix on collision", () => {
    expect(
      buildImageFileName({
        customName: "My Final Render",
        prompt: "ignored prompt",
        generatedAt,
        format: "png",
        existingFileNames: ["my-final-render.png", "my-final-render-2.png"],
      }),
    ).toBe("my-final-render-3.png");
  });
});

describe("buildOutputPath", () => {
  it("uses a date folder", () => {
    expect(
      buildOutputPath("", new Date("2026-05-01T09:08:07"), "image.png"),
    ).toBe("outputs/2026-05-01/image.png");
  });
});
