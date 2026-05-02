import { describe, expect, it } from "vitest";

import {
  classifyProviderError,
  createProviderCircuit,
  pickApiKey,
  recordApiKeyResult,
  type ApiKeyRuntimeState,
} from "./index";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

function key(id: string): ApiKeyRuntimeState {
  return {
    id,
    label: id,
    enabled: true,
    state: "healthy",
    cooldownUntilMs: null,
    inFlight: 0,
    maxInFlight: 1,
    success15m: 5,
    fail15m: 0,
    costRiskFail15m: 0,
    rateLimit15m: 0,
    success1h: 10,
    fail1h: 0,
    consecutiveFailures: 0,
    consecutiveCostRiskFailures: 0,
    ewmaLatencyMs: null,
    lastUsedAtMs: null,
  };
}

describe("platform-core package", () => {
  it("exports the supplier circuit protection primitives", () => {
    const provider = createProviderCircuit({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      nowMs,
    });
    const selected = pickApiKey([key("one"), key("two")], provider, {
      nowMs,
      random: () => 0,
    });

    const result = recordApiKeyResult(
      { ...selected, inFlight: 1 },
      provider,
      { kind: "failure", classification: classifyProviderError({ status: 524 }) },
      nowMs,
    );

    expect(result.provider.state).toBe("open");
  });
});
