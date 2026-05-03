import type { CreditLedgerEvent, PlatformRepository } from "@chat-to-image/platform-db";

export type CreditServiceRepository = Pick<
  PlatformRepository,
  "addCreditLedgerEvent" | "getCreditBalance" | "listCreditLedgerEvents" | "recordAdminAuditLog"
>;

export type CreditOverview = {
  balance: number;
  ledger: CreditLedgerEvent[];
};

export async function grantDailyFreeCredit(input: {
  repo: CreditServiceRepository;
  userId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const ledger = await input.repo.listCreditLedgerEvents(input.userId);
  const alreadyGranted = ledger.some(
    (event) =>
      event.eventType === "daily_free_grant" &&
      toUtcDayKey(event.createdAt) === toUtcDayKey(now),
  );

  if (alreadyGranted) {
    return {
      granted: false,
      amount: 0,
      balance: await input.repo.getCreditBalance(input.userId),
    };
  }

  await input.repo.addCreditLedgerEvent({
    userId: input.userId,
    eventType: "daily_free_grant",
    amount: 1,
    reason: "Daily free image credit",
    createdAt: now,
  });

  return {
    granted: true,
    amount: 1,
    balance: await input.repo.getCreditBalance(input.userId),
  };
}

export async function addAdminCredits(input: {
  repo: CreditServiceRepository;
  adminUserId: string;
  userId: string;
  amount: number;
  reason: string;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Admin credit amount must be a positive integer.");
  }

  await input.repo.addCreditLedgerEvent({
    userId: input.userId,
    eventType: "admin_adjustment",
    amount: input.amount,
    reason: input.reason,
  });
  await input.repo.recordAdminAuditLog({
    adminUserId: input.adminUserId,
    action: "credit.admin_adjustment",
    targetType: "user",
    targetId: input.userId,
    detail: {
      amount: input.amount,
      reason: input.reason,
    },
  });

  return getCreditOverview({ repo: input.repo, userId: input.userId });
}

export async function getCreditOverview(input: {
  repo: CreditServiceRepository;
  userId: string;
}): Promise<CreditOverview> {
  const [balance, ledger] = await Promise.all([
    input.repo.getCreditBalance(input.userId),
    input.repo.listCreditLedgerEvents(input.userId),
  ]);
  return { balance, ledger };
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
