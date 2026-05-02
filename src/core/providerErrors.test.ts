import { describe, expect, it } from "vitest";

import {
  classifyProviderError,
  isCostRiskProviderError,
  type ProviderErrorInput,
} from "./providerErrors";

describe("classifyProviderError", () => {
  it("treats HTTP 524 as a cost-risk provider failure", () => {
    const result = classifyProviderError({
      status: 524,
      responseBody:
        '{"error":{"message":"openai_error","type":"bad_response_status_code","code":"bad_response_status_code"}}',
    });

    expect(result.category).toBe("cost_risk");
    expect(result.shouldOpenProviderCircuit).toBe(true);
    expect(result.shouldDisableApiKey).toBe(false);
    expect(result.userChargeable).toBe(false);
  });

  it("treats openai_error markers as cost-risk even without status", () => {
    expect(classifyProviderError({ message: "Request failed: openai_error" }).category).toBe("cost_risk");
  });

  it("treats bad_response_status_code markers as cost-risk", () => {
    expect(classifyProviderError({ code: "bad_response_status_code" }).shouldOpenProviderCircuit).toBe(true);
  });

  it("treats missing image data as cost-risk because the provider may have charged", () => {
    expect(classifyProviderError({ message: "Image generation response did not contain any image data." })).toMatchObject(
      {
        category: "cost_risk",
        shouldOpenProviderCircuit: true,
        userChargeable: false,
      },
    );
  });

  it("treats structured 200 error payloads as cost-risk for image generation", () => {
    const input: ProviderErrorInput = {
      status: 200,
      payload: {
        error: {
          message: "openai_error",
          type: "bad_response_status_code",
          code: "bad_response_status_code",
        },
      },
    };

    expect(isCostRiskProviderError(input)).toBe(true);
  });

  it("classifies auth errors as key-disabling errors only", () => {
    expect(classifyProviderError({ status: 401 }).category).toBe("auth");
    expect(classifyProviderError({ status: 403 }).shouldDisableApiKey).toBe(true);
    expect(classifyProviderError({ status: 403 }).shouldOpenProviderCircuit).toBe(false);
  });

  it("classifies 429 as key cooldown and not provider circuit", () => {
    expect(classifyProviderError({ status: 429 })).toMatchObject({
      category: "rate_limit",
      shouldCooldownApiKey: true,
      shouldOpenProviderCircuit: false,
      userChargeable: false,
    });
  });

  it("classifies timeout and network failures without opening the supplier circuit", () => {
    expect(classifyProviderError({ kind: "timeout" })).toMatchObject({
      category: "timeout",
      shouldOpenProviderCircuit: false,
    });
    expect(classifyProviderError({ kind: "network" })).toMatchObject({
      category: "network",
      shouldOpenProviderCircuit: false,
    });
  });
});
