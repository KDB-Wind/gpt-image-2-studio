import { describe, expect, it } from "vitest";

import {
  classifyProviderError,
  isCostRiskProviderError,
  summarizeSensitiveError,
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
    expect(
      classifyProviderError({
        status: 500,
        payload: {
          error: {
            message: "Internal server error",
          },
        },
      }),
    ).toMatchObject({
      category: "unknown",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: false,
      userChargeable: false,
    });
  });

  it("treats structured 500 payloads with explicit cost-risk markers as cost-risk", () => {
    expect(
      classifyProviderError({
        status: 500,
        payload: {
          error: {
            message: "openai_error",
            code: "bad_response_status_code",
          },
        },
      }),
    ).toMatchObject({
      category: "cost_risk",
      shouldOpenProviderCircuit: true,
      shouldCooldownApiKey: true,
      userChargeable: false,
    });
  });

  it("treats new-api upstream failures as cost-risk provider errors", () => {
    expect(
      classifyProviderError({
        status: 500,
        responseBody:
          '{"error":{"message":"upstream error: do request failed","type":"new_api_error","code":"do_request_failed"}}',
      }),
    ).toMatchObject({
      category: "cost_risk",
      shouldOpenProviderCircuit: true,
      shouldCooldownApiKey: true,
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

  it("does not treat generic structured 500 payloads as cost-risk", () => {
    expect(
      isCostRiskProviderError({
        status: 500,
        payload: {
          error: {
            message: "Internal server error",
          },
        },
      }),
    ).toBe(false);
  });

  it("still treats structured 500 payloads with explicit markers as cost-risk", () => {
    expect(
      isCostRiskProviderError({
        status: 500,
        payload: {
          error: {
            message: "openai_error",
          },
        },
      }),
    ).toBe(true);
  });
});

describe("summarizeSensitiveError", () => {
  it("redacts secrets, signed URLs, nested payload fields, and long vendor bodies while keeping status and category", () => {
    const bearerSecret = ["sk", "secret-secret-secret"].join("-");
    const nestedApiKey = ["sk", "live-secret-secret"].join("-");
    const nestedAccessToken = ["1ts", "secret_secret_secret"].join("_");
    const summary = summarizeSensitiveError({
      status: 403,
      message: `Authorization: Bearer ${bearerSecret} failed for https://provider.example/image.png?token=private-token`,
      responseBody: JSON.stringify({
        error: {
          message: "Forbidden",
          type: "auth_error",
          code: "bad_api_key",
          details: {
            api_key: nestedApiKey,
            access_token: nestedAccessToken,
            url: "https://provider.example/private.png?signature=very-secret",
          },
        },
      }),
      payload: {
        error: {
          message: "Forbidden",
          code: "bad_api_key",
          metadata: {
            token: "private-token",
            nested: {
              authorization: `Bearer ${nestedApiKey}`,
            },
          },
        },
      },
    });

    expect(summary).toContain("HTTP 403");
    expect(summary).toContain("auth");
    expect(summary).toContain("Forbidden");
    expect(summary).not.toContain(bearerSecret);
    expect(summary).not.toContain(nestedApiKey);
    expect(summary).not.toContain(nestedAccessToken);
    expect(summary).not.toContain("private-token");
    expect(summary).not.toContain("provider.example");
    expect(summary).not.toContain("responseBody");
    expect(summary.length).toBeLessThanOrEqual(280);
  });

  it("summarizes raw JSON-ish vendor errors without echoing their full body", () => {
    const summary = summarizeSensitiveError(
      'HTTP 500 upstream failure: {"error":{"message":"boom","type":"new_api_error","code":"do_request_failed","token":"private-token","api_key":"sk-secret"}}',
    );

    expect(summary).toContain("HTTP 500");
    expect(summary).toContain("cost");
    expect(summary).toContain("boom");
    expect(summary).not.toContain("private-token");
    expect(summary).not.toContain("sk-secret");
    expect(summary).not.toContain('"token"');
  });

  it("redacts assignment variants and long provider tokens within the requested limit", () => {
    const openAiLikeToken = ["sk", "abcdefghijklmnopqrstuvwx"].join("-");
    const stepLikeToken = ["1ts", "abcdefghijklmnopqrstuvwx"].join("_");
    const base64Bearer = ["abcDEF0123456789", "+/=="].join("");
    const summary = summarizeSensitiveError(
      `HTTP 429 Authorization: Bearer ${base64Bearer} api_key=plain-secret key='quoted-secret' ` +
        "token=token-secret access_token=access-secret client_secret=client-secret private_key='private-secret' " +
        `${openAiLikeToken} ${stepLikeToken} ` +
        "https://provider.example/file?X-Amz-Signature=signed-secret&token=query-secret " +
        "provider body " +
        "x".repeat(600),
      { maxLength: 120 },
    );

    expect(summary).toContain("HTTP 429");
    expect(summary).toContain("rate limit");
    expect(summary).not.toContain("plain-secret");
    expect(summary).not.toContain("quoted-secret");
    expect(summary).not.toContain("token-secret");
    expect(summary).not.toContain("access-secret");
    expect(summary).not.toContain(base64Bearer);
    expect(summary).not.toContain("client-secret");
    expect(summary).not.toContain("private-secret");
    expect(summary).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(summary).not.toContain("provider.example");
    expect(summary).not.toContain("signed-secret");
    expect(summary).not.toContain("query-secret");
    expect(summary.length).toBeLessThanOrEqual(120);
  });

  it("redacts underscored secret fields and base64-shaped bearer credentials", () => {
    const base64Bearer = ["abcDEF0123456789", "+/=="].join("");
    const summary = summarizeSensitiveError(
      `HTTP 403 client_secret=client-secret private_key='private-secret' Authorization: Bearer ${base64Bearer}`,
      { maxLength: 500 },
    );

    expect(summary).toContain("HTTP 403");
    expect(summary).not.toContain("client-secret");
    expect(summary).not.toContain("private-secret");
    expect(summary).not.toContain(base64Bearer);
  });
});
