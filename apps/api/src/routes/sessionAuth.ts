import { createHash } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

import type { PlatformRepository, User } from "@chat-to-image/platform-db";
import type { HashToken } from "../services/authService";

export type SessionAuthRouteDependencies = {
  repo: PlatformRepository;
  now: () => number;
  auth?: {
    hashToken?: HashToken;
  };
};

export async function requireUserSession(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: SessionAuthRouteDependencies,
): Promise<User | null> {
  const token = getSessionToken(request);
  if (!token) {
    reply.status(401).send({ error: "Session token is required." });
    return null;
  }

  const tokenHash = (deps.auth?.hashToken ?? defaultHashToken)(token);
  const session = await deps.repo.getSessionByTokenHash(tokenHash);
  if (!session || session.revokedAt || session.expiresAt.getTime() <= deps.now()) {
    reply.status(401).send({ error: "Session token is invalid or expired." });
    return null;
  }

  const user = await deps.repo.getUser(session.userId);
  if (!user || user.disabled) {
    reply.status(403).send({ error: "Session user is disabled or missing." });
    return null;
  }

  return user;
}

export async function requireMatchingUserSession(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: SessionAuthRouteDependencies,
  userId: string,
): Promise<User | null> {
  const user = await requireUserSession(request, reply, deps);
  if (!user) {
    return null;
  }

  if (user.id !== userId) {
    reply.status(403).send({ error: "Session user does not match requested user." });
    return null;
  }

  return user;
}

function getSessionToken(request: FastifyRequest): string | null {
  const explicitHeader = readHeaderValue(request.headers["x-session-token"]);
  if (explicitHeader) {
    return explicitHeader;
  }

  const authorization = readHeaderValue(request.headers.authorization);
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

function readHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}

function defaultHashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
