import { buildApiApp } from "./app";
import {
  createOpenAIProviderHealthProbe,
  createRuntimeRepository,
  providerModelToCircuit,
  syncHostedProviderFromEnv,
} from "./runtime";
import { createBullMqGenerationQueue, createRedisConnectionFromEnv } from "./services/generationQueue";

const nowMs = Date.now();
const runtime = createRuntimeRepository(process.env);
const { model } = await syncHostedProviderFromEnv({
  repo: runtime.repo,
  env: process.env,
  nowMs,
});
const generationQueue = createBullMqGenerationQueue({
  connection: createRedisConnectionFromEnv(),
  timeoutMs: Number(process.env.GENERATION_JOB_TIMEOUT_MS ?? 240000),
});

const app = buildApiApp({
  repo: runtime.repo,
  provider: providerModelToCircuit(model),
  now: () => Date.now(),
  enqueue: generationQueue.enqueue,
  admin: {
    token: process.env.PLATFORM_ADMIN_TOKEN,
  },
  health: {
    probe: createOpenAIProviderHealthProbe(process.env),
  },
});

const shutdown = async () => {
  await app.close();
  await generationQueue.queue.close();
  await runtime.close();
};

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

try {
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
} catch (error) {
  await shutdown();
  throw error;
}
