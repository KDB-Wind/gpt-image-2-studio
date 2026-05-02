import {
  createHealthProbeAttempt,
  recordApiKeyResult,
  shouldRunScheduledHealthProbe,
  type ApiKeyResult,
  type ApiKeyRuntimeState,
  type ProviderCircuit,
} from "@chat-to-image/platform-core";

export type RunHealthProbeInput = {
  provider: ProviderCircuit;
  keys: ApiKeyRuntimeState[];
  nowMs: number;
  callProvider: (input: { key: ApiKeyRuntimeState }) => Promise<ApiKeyResult>;
};

export type RunHealthProbeResult =
  | { kind: "skipped"; provider: ProviderCircuit }
  | { kind: "probed"; provider: ProviderCircuit; key: ApiKeyRuntimeState };

export async function runHealthProbe(input: RunHealthProbeInput): Promise<RunHealthProbeResult> {
  if (!shouldRunScheduledHealthProbe(input.provider, input.nowMs)) {
    return { kind: "skipped", provider: input.provider };
  }

  const attempt = createHealthProbeAttempt(input.keys, input.provider, input.nowMs);
  const providerResult = await input.callProvider({ key: attempt.key });
  const update = recordApiKeyResult(attempt.key, attempt.provider, providerResult, input.nowMs);

  return {
    kind: "probed",
    key: update.key,
    provider: update.provider,
  };
}
