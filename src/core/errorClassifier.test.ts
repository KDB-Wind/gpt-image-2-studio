import { describe, expect, it } from "vitest";

import { formatClassifiedError } from "../i18n/translations";
import { classifyErrorForUser } from "./errorClassifier";

describe("classifyErrorForUser", () => {
  it("classifies authentication failures and gives manual fix guidance", () => {
    const error = new Error("Request failed with status 401: invalid api key");
    const result = classifyErrorForUser(error);
    const message = formatClassifiedError(error, "en-US");

    expect(result.kind).toBe("auth");
    expect(message).toContain("Authentication");
    expect(message).toContain("API key");
    expect(message).toContain("Do not retry");
    expect(result.costWarning).toBe(false);
  });

  it("classifies upstream provider failures and warns that retrying may cost money", () => {
    const error = new Error(
      'Request failed with status 524: {"error":{"message":"openai_error","type":"bad_response_status_code","code":"bad_response_status_code"}}',
    );
    const result = classifyErrorForUser(error);
    const message = formatClassifiedError(error, "en-US");

    expect(result.kind).toBe("provider");
    expect(message).toContain("Provider");
    expect(message).toContain("upstream");
    expect(message).toContain("may still incur cost");
    expect(result.costWarning).toBe(true);
  });

  it("classifies timeouts separately from provider HTTP failures", () => {
    const error = new Error("Request timed out after 180 seconds.");
    const result = classifyErrorForUser(error);
    const message = formatClassifiedError(error, "en-US");

    expect(result.kind).toBe("timeout");
    expect(message).toContain("increase the timeout");
    expect(result.costWarning).toBe(true);
  });

  it("classifies empty image responses as provider-side abnormal responses", () => {
    const error = new Error("Image generation response did not contain any image data.");
    const result = classifyErrorForUser(error);
    const message = formatClassifiedError(error, "en-US");

    expect(result.kind).toBe("empty-image");
    expect(message).toContain("no image data");
    expect(result.costWarning).toBe(true);
  });

  it("returns Chinese copy when the active UI language is Chinese", () => {
    const error = new Error("Failed to fetch");
    const result = classifyErrorForUser(error);
    const message = formatClassifiedError(error, "zh-CN");

    expect(result.kind).toBe("network");
    expect(message).toContain("网络");
    expect(message).toContain("不会自动重试");
  });
});
