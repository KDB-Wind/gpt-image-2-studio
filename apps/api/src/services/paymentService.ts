import type { Payment, PlatformRepository } from "@chat-to-image/platform-db";

export type CreatePaymentRequestInput = {
  repo: PlatformRepository;
  userId: string;
  amountCny: number;
  note?: string | null;
};

export type ApprovePaymentInput = {
  repo: PlatformRepository;
  paymentId: string;
  adminUserId: string;
};

export type RejectPaymentInput = ApprovePaymentInput & {
  reason: string;
};

const PAYMENT_PACKAGES = new Map<number, number>([
  [5, 50],
  [10, 100],
]);

export function listPaymentPackages() {
  return [...PAYMENT_PACKAGES.entries()].map(([amountCny, credits]) => ({ amountCny, credits }));
}

export async function createPaymentRequest(input: CreatePaymentRequestInput): Promise<Payment> {
  const user = await input.repo.getUser(input.userId);
  if (!user || user.disabled) {
    throw new Error("User is not allowed to create payment requests.");
  }

  const credits = PAYMENT_PACKAGES.get(input.amountCny);
  if (!credits) {
    throw new Error("Unsupported payment package.");
  }

  return input.repo.createPayment({
    userId: input.userId,
    amountCny: input.amountCny,
    credits,
    status: "pending",
    note: input.note?.trim() || null,
  });
}

export async function approvePayment(input: ApprovePaymentInput): Promise<Payment> {
  const payment = await requirePayment(input.repo, input.paymentId);
  if (payment.status === "approved") {
    return payment;
  }
  if (payment.status === "rejected") {
    throw new Error("Rejected payment cannot be approved.");
  }

  const approved = await input.repo.updatePayment(payment.id, { status: "approved" });
  await input.repo.addCreditLedgerEvent({
    userId: payment.userId,
    eventType: "manual_payment_credit",
    amount: payment.credits,
    reason: `Payment approved: ${payment.amountCny} CNY`,
  });
  await input.repo.recordAdminAuditLog({
    adminUserId: input.adminUserId,
    action: "payment.approve",
    targetType: "payment",
    targetId: payment.id,
    detail: { amountCny: payment.amountCny, credits: payment.credits },
  });
  return approved;
}

export async function rejectPayment(input: RejectPaymentInput): Promise<Payment> {
  const payment = await requirePayment(input.repo, input.paymentId);
  if (payment.status === "approved") {
    throw new Error("Approved payment cannot be rejected.");
  }
  if (payment.status === "rejected") {
    return payment;
  }

  const rejected = await input.repo.updatePayment(payment.id, {
    status: "rejected",
    note: joinNotes(payment.note, input.reason),
  });
  await input.repo.recordAdminAuditLog({
    adminUserId: input.adminUserId,
    action: "payment.reject",
    targetType: "payment",
    targetId: payment.id,
    detail: { reason: input.reason },
  });
  return rejected;
}

async function requirePayment(repo: PlatformRepository, paymentId: string): Promise<Payment> {
  const payment = await repo.getPayment(paymentId);
  if (!payment) {
    throw new Error(`Payment not found: ${paymentId}`);
  }
  return payment;
}

function joinNotes(current: string | null, next: string): string {
  const reason = next.trim();
  if (!current) {
    return reason;
  }

  return reason ? `${current}\n${reason}` : current;
}
