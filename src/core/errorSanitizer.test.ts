import { describe, expect, it } from "vitest";

import { sanitizeProviderError } from "./errorSanitizer";

describe("sanitizeProviderError", () => {
  it("redacts provider urls, bearer tokens, assignments, and nested response bodies", () => {
    const secret = ["private", "provider", "token", "value", "123456789"].join("-");
    const result = sanitizeProviderError({
      status: 403,
      message: `Authorization: Bearer ${secret} failed at https://provider.example/file.png?token=${secret}`,
      responseBody: JSON.stringify({
        error: {
          message: `Forbidden for api_key=${secret}`,
          request_id: "req_safe_123456",
        },
      }),
    });

    expect(result.category).toBe("auth");
    expect(result.requestId).toBe("req_safe_123456");
    expect(result.userMessage).not.toContain(secret);
    expect(result.userMessage).not.toContain("provider.example");
    expect(result.userMessage).not.toContain("Bearer");
    expect(result.userMessage.length).toBeLessThanOrEqual(280);
  });

  it.each([
    [{ status: 429, message: "rate limited" }, "rate-limit"],
    [{ kind: "timeout", message: "request timed out" }, "timeout"],
    [{ kind: "network", message: "Failed to fetch" }, "network"],
    [{ status: 500, message: "upstream error" }, "provider"],
    [new Error("Unexpected local failure"), "unknown"],
  ] as const)("maps %o to %s", (input, category) => {
    expect(sanitizeProviderError(input).category).toBe(category);
  });

  it("extracts only a bounded safe request id", () => {
    const result = sanitizeProviderError(
      new Error("Request failed (request id: req_abc-123_XYZ), token=private-value-that-must-not-leak"),
    );

    expect(result.requestId).toBe("req_abc-123_XYZ");
    expect(result.userMessage).not.toContain("private-value-that-must-not-leak");
  });

  it("does not expose a credential-looking value that is mislabeled as a request id", () => {
    const credentialLikeRequestId = ["sk", "live", "Q".repeat(32)].join("-");
    const result = sanitizeProviderError(
      new Error(`Request failed (request id: ${credentialLikeRequestId})`),
    );

    expect(result.requestId).toBeUndefined();
    expect(result.userMessage).not.toContain(credentialLikeRequestId);
  });

  it.each([
    [["ghp", "Q".repeat(30)].join("_")],
    [["github", "pat", "R".repeat(36)].join("_")],
    [["AKIA", "S".repeat(16)].join("")],
  ])("redacts other common credentials mislabeled as request ids", (credentialLikeRequestId) => {
    const result = sanitizeProviderError(
      new Error(`Request failed (request id: ${credentialLikeRequestId})`),
    );

    expect(result.requestId).toBeUndefined();
    expect(result.userMessage).not.toContain(credentialLikeRequestId);
  });

  it.each([
    [`req_${["ghp", "T".repeat(30)].join("_")}`],
    [`request-${["github", "pat", "U".repeat(36)].join("_")}`],
    [`trace_${["AKIA", "V".repeat(16)].join("")}`],
  ])("rejects request ids that wrap a credential-shaped token", (credentialLikeRequestId) => {
    const result = sanitizeProviderError(
      new Error(`Request failed (request id: ${credentialLikeRequestId})`),
    );

    expect(result.requestId).toBeUndefined();
    expect(result.userMessage).not.toContain(credentialLikeRequestId);
  });

  it("treats generic upstream HTTP failures as provider errors", () => {
    expect(sanitizeProviderError({ status: 502, message: "Bad gateway" }).category).toBe("provider");
  });

  it("does not expose a full JSON error when the provider returns a successful HTTP status", () => {
    const result = sanitizeProviderError({
      status: 200,
      payload: {
        error: {
          type: "new_api_error",
          message: "upstream error",
          signed_url: "https://provider.example/private.png?signature=hidden-value",
        },
      },
    });

    expect(result.category).toBe("provider");
    expect(result.userMessage).toContain("details redacted");
    expect(result.userMessage).not.toContain("signed_url");
    expect(result.userMessage).not.toContain("hidden-value");
  });

  it("redacts and bounds an overlong JSON response body", () => {
    const secret = ["overlong", "private", "provider", "token", "123456789"].join("-");
    const responseBody = JSON.stringify({
      error: {
        message: `${"upstream failure ".repeat(200)}https://provider.example/image?token=${secret} Authorization: Bearer ${secret}`,
      },
    });
    const result = sanitizeProviderError({ status: 500, responseBody });

    expect(result.userMessage.length).toBeLessThanOrEqual(280);
    expect(result.userMessage).not.toContain(secret);
    expect(result.userMessage).not.toContain("provider.example");
    expect(result.userMessage).not.toContain("Bearer");
  });
});
