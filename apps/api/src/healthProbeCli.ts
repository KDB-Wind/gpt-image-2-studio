import {
  createOpenAIProviderHealthProbe,
  createRuntimeRepository,
  syncHostedProviderFromEnv,
} from "./runtime";
import { runScheduledHealthProbeOnce } from "./healthProbeRuntime";

const runtime = createRuntimeRepository(process.env);

try {
  await syncHostedProviderFromEnv({
    repo: runtime.repo,
    env: process.env,
    nowMs: Date.now(),
  });
  const summary = await runScheduledHealthProbeOnce({
    repo: runtime.repo,
    nowMs: Date.now(),
    probe: createOpenAIProviderHealthProbe(process.env),
  });
  console.info(JSON.stringify(summary));
  process.exitCode = summary.failure > 0 ? 2 : 0;
} finally {
  await runtime.close();
}
