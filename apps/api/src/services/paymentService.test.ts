import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { approvePayment, createPaymentRequest, rejectPayment } from "./paymentService";

describe("paymentService", () => {
  it("creates fixed-package payment requests and approves them into credits once", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });

    const payment = await createPaymentRequest({
      repo,
      userId: user.id,
      amountCny: 5,
      note: "微信昵称 Demo",
    });
    const approved = await approvePayment({
      repo,
      paymentId: payment.id,
      adminUserId: "admin-1",
    });
    const approvedAgain = await approvePayment({
      repo,
      paymentId: payment.id,
      adminUserId: "admin-1",
    });

    expect(payment).toMatchObject({ amountCny: 5, credits: 50, status: "pending" });
    expect(approved.status).toBe("approved");
    expect(approvedAgain.status).toBe("approved");
    await expect(repo.getCreditBalance(user.id)).resolves.toBe(50);
  });

  it("rejects unsupported packages and rejected payments do not grant credits", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });

    await expect(
      createPaymentRequest({
        repo,
        userId: user.id,
        amountCny: 7,
        note: null,
      }),
    ).rejects.toThrow("Unsupported payment package");

    const payment = await createPaymentRequest({
      repo,
      userId: user.id,
      amountCny: 10,
      note: null,
    });
    const rejected = await rejectPayment({
      repo,
      paymentId: payment.id,
      adminUserId: "admin-1",
      reason: "未找到付款记录",
    });

    expect(rejected.status).toBe("rejected");
    await expect(repo.getCreditBalance(user.id)).resolves.toBe(0);
  });
});
