import type {
  AddCreditLedgerEventInput,
  CreateGenerationJobInput,
  CreateUserInput,
  GenerationJob,
  PlatformRepository,
  User,
} from "./repository";

export function createInMemoryPlatformRepository(): PlatformRepository {
  const users = new Map<string, User>();
  const balances = new Map<string, number>();
  const jobs = new Map<string, GenerationJob>();
  let userSequence = 0;
  let jobSequence = 0;

  return {
    async createUser(input: CreateUserInput) {
      const user: User = {
        id: `user-${++userSequence}`,
        email: input.email.toLowerCase(),
        disabled: false,
        createdAt: new Date(),
      };
      users.set(user.id, user);
      balances.set(user.id, 0);
      return user;
    },

    async getUser(userId: string) {
      return users.get(userId) ?? null;
    },

    async addCreditLedgerEvent(input: AddCreditLedgerEventInput) {
      const current = balances.get(input.userId) ?? 0;
      balances.set(input.userId, current + input.amount);
    },

    async getCreditBalance(userId: string) {
      return balances.get(userId) ?? 0;
    },

    async createGenerationJob(input: CreateGenerationJobInput) {
      const now = new Date();
      const job: GenerationJob = {
        id: `job-${++jobSequence}`,
        userId: input.userId,
        mode: input.mode,
        prompt: input.prompt,
        imageModel: input.imageModel,
        status: input.status,
        selectedApiKeyId: null,
        errorCategory: null,
        createdAt: now,
        updatedAt: now,
      };
      jobs.set(job.id, job);
      return job;
    },

    async updateGenerationJob(jobId: string, patch: Partial<GenerationJob>) {
      const current = jobs.get(jobId);
      if (!current) {
        throw new Error(`Generation job not found: ${jobId}`);
      }
      const next = { ...current, ...patch, id: current.id, updatedAt: new Date() };
      jobs.set(jobId, next);
      return next;
    },

    async getGenerationJob(jobId: string) {
      return jobs.get(jobId) ?? null;
    },
  };
}
