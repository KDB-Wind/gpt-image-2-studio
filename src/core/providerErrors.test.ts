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

    expect(classifyProviderError(input)).toMatchObject({
      category: "cost_risk",
      shouldOpenProviderCircuit: true,
      shouldCooldownApiKey: true,
      shouldDisableApiKey: false,
      userChargeable: false,
    });
  });

  it("classifies auth errors as key-disabling errors only", () => {
    expect(
      classifyProviderError({
        status: 401,
        message: "openai_error",
      }),
    ).toMatchObject({
      category: "auth",
      shouldDisableApiKey: true,
      shouldOpenProviderCircuit: false,
      userChargeable: false,
    });
    expect(
      classifyProviderError({
        status: 403,
        payload: { error: { message: "openai_error" } },
      }),
    ).toMatchObject({
      category: "auth",
      shouldDisableApiKey: true,
      shouldOpenProviderCircuit: false,
      userChargeable: false,
    });
  });

  it("classifies 429 as key cooldown and not provider circuit", () => {
    expect(classifyProviderError({ status: 429, code: "bad_response_status_code" })).toMatchObject({
      category: "rate_limit",
      shouldCooldownApiKey: true,
      shouldOpenProviderCircuit: false,
      userChargeable: false,
    });
  });

  it("classifies timeout and network failures without opening the supplier circuit", () => {
    expect(classifyProviderError({ kind: "timeout", message: "openai_error" })).toMatchObject({
      category: "timeout",
      shouldOpenProviderCircuit: false,
    });
    expect(classifyProviderError({ status: 408, payload: { error: { message: "openai_error" } } })).toMatchObject({
      category: "timeout",
      shouldOpenProviderCircuit: false,
    });
    expect(classifyProviderError({ kind: "network", responseBody: '{"error":{"message":"openai_error"}}' })).toMatchObject({
      category: "network",
      shouldOpenProviderCircuit: false,
    });
  });

  it("classifies HTTP 400 without cost-risk markers as validation", () => {
    expect(classifyProviderError({ status: 400, message: "Prompt is required." })).toMatchObject({
      category: "validation",
      shouldOpenProviderCircuit: false,
      userChargeable: false,
    });
    expect(
      classifyProviderError({
        status: 400,
        payload: {
          error: {
            message: "Prompt is required.",
          },
        },
      }),
    ).toMatchObject({
      category: "validation",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      userChargeable: false,
    });
  });

  it("still treats HTTP 400 with explicit no-image markers as cost-risk", () => {
    expect(classifyProviderError({ status: 400, message: "no image data" }).category).toBe("cost_risk");
    expect(classifyProviderError({ status: 400, message: "empty image response" }).category).toBe("cost_risk");
  });

  it("falls back to unknown when no rule matches", () => {
    expect(classifyProviderError({ status: 500, message: "Internal server error" })).toMatchObject({
      category: "unknown",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: false,
      userChargeable: false,
    });
  });
});

describe("isCostRiskProviderError", () => {
  it("does not treat generic 400 validation payloads as cost-risk", () => {
    expect(
      isCostRiskProviderError({
        status: 400,
        payload: {
          error: {
            message: "Prompt is required.",
          },
        },
      }),
    ).toBe(false);
  });

  it("still treats structured 200 provider errors as cost-risk", () => {
    expect(
      isCostRiskProviderError({
        status: 200,
        payload: {
          error: {
            message: "openai_error",
          },
        },
      }),
    ).toBe(true);
  });
});
