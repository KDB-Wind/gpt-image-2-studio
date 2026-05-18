import type { PlatformRepository } from "@chat-to-image/platform-db";
import {
  runDueProviderHealthProbes,
  type ProviderHealthProbe,
  type ProviderHealthResult,
} from "./services/providerHealthService";

export type ScheduledHealthProbeSummary = {
  checked: number;
  success: number;
  failure: number;
  skipped: number;
  messages: string[];
};

export async function runScheduledHealthProbeOnce(input: {
  repo: PlatformRepository;
  nowMs: number;
  probe: ProviderHealthProbe;
}): Promise<ScheduledHealthProbeSummary> {
  const results = await runDueProviderHealthProbes(input);
  return summarizeHealthProbeResults(results);
}

function summarizeHealthProbeResults(results: ProviderHealthResult[]): ScheduledHealthProbeSummary {
  return {
    checked: results.length,
    success: results.filter((result) => result.status === "success").length,
    failure: results.filter((result) => result.status === "failure").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    messages: results.map((result) => `${result.status}:${result.providerModelId}:${result.message}`),
  };
}
