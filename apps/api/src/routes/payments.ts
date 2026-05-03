import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PlatformRepository } from "@chat-to-image/platform-db";
import {
  approvePayment,
  createPaymentRequest,
  listPaymentPackages,
  rejectPayment,
} from "../services/paymentService";
import { requireAdminToken, type AdminRouteOptions } from "./adminAuth";

export type PaymentRouteDependencies = AdminRouteOptions & {
  repo: PlatformRepository;
};

const createPaymentSchema = z.object({
  userId: z.string().min(1),
  amountCny: z.number().int().positive(),
  note: z.string().max(500).nullable().optional(),
});

const adminPaymentActionSchema = z.object({
  adminUserId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export function registerPaymentRoutes(app: FastifyInstance, deps: PaymentRouteDependencies) {
  app.get("/api/payment-packages", async () => ({ packages: listPaymentPackages() }));

  app.post("/api/payments", async (request, reply) => {
    const parsed = createPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payment request.", details: parsed.error.flatten() });
    }

    try {
      return await createPaymentRequest({ repo: deps.repo, ...parsed.data });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/:userId/payments", async (request, reply) => {
    const params = z.object({ userId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid payment history request." });
    }

    return { payments: await deps.repo.listPayments(params.data.userId) };
  });

  app.get("/api/admin/payments", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    return { payments: await deps.repo.listPayments() };
  });

  app.post("/api/admin/payments/:paymentId/approve", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const params = z.object({ paymentId: z.string().min(1) }).safeParse(request.params);
    const body = adminPaymentActionSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "Invalid payment approval request." });
    }

    try {
      return await approvePayment({
        repo: deps.repo,
        paymentId: params.data.paymentId,
        adminUserId: body.data.adminUserId,
      });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/payments/:paymentId/reject", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const params = z.object({ paymentId: z.string().min(1) }).safeParse(request.params);
    const body = adminPaymentActionSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "Invalid payment rejection request." });
    }

    try {
      return await rejectPayment({
        repo: deps.repo,
        paymentId: params.data.paymentId,
        adminUserId: body.data.adminUserId,
        reason: body.data.reason ?? "Payment rejected by admin.",
      });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Payment request failed.";
}
