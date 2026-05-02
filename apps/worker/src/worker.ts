import { Worker } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
};

new Worker(
  "generation-jobs",
  async (job) => {
    console.log(`Received generation job ${job.id}`, job.data);
  },
  { connection },
);
