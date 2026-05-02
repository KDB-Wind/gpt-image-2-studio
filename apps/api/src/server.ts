import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createProviderCircuit } from "@chat-to-image/platform-core";
import { buildApiApp } from "./app";

const nowMs = Date.now();
const repo = createInMemoryPlatformRepository();
const provider = createProviderCircuit({
  providerId: "ruoli",
  baseUrl: process.env.PLATFORM_BASE_URL ?? "https://ruoli.dev/v1",
  imageModel: process.env.PLATFORM_IMAGE_MODEL ?? "gpt-image-2",
  nowMs,
});

const app = buildApiApp({
  repo,
  provider,
  now: () => Date.now(),
  enqueue: async (jobId) => ({ queueId: jobId }),
});

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
