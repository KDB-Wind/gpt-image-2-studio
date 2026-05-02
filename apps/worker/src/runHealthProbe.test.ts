import { describe, expect, it } from "vitest";

import {
  classifyProviderError,
  createApiKeyRuntimeState,
  createProviderCircuit,
  recordProviderFailure,
} from "@chat-to-image/platform-core";
import { runHealthProbe } from "./runHealthProbe";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("runHealthProbe", () => {
  it("skips scheduled checks while provider circuit is still open", async () => {
    const provider = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );

    const result = await runHealthProbe({
      provider,
      keys: [createApiKeyRuntimeState({ id: "key-1", label: "Key 1", maxInFlight: 1 })],
      nowMs: nowMs + 60_000,
      callProvider: async () => {
        throw new Error("probe should not run");
      },
    });

    expect(result.kind).toBe("skipped");
  });

  it("uses exactly one key after the circuit cooldown expires", async () => {
    const provider = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );
    const calledKeys: string[] = [];

    const result = await runHealthProbe({
      provider,
      keys: [
        createApiKeyRuntimeState({ id: "key-1", label: "Key 1", maxInFlight: 1 }),
        createApiKeyRuntimeState({ id: "key-2", label: "Key 2", maxInFlight: 1 }),
      ],
      nowMs: nowMs + 5 * 60 * 1000 + 1,
      callProvider: async ({ key }) => {
        calledKeys.push(key.id);
        return { kind: "success", latencyMs: 120000 };
      },
    });

    expect(result.kind).toBe("probed");
    expect(calledKeys).toEqual(["key-1"]);
  });
});
