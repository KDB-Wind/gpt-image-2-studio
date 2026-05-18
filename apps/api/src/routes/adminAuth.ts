import type { FastifyReply, FastifyRequest } from "fastify";

export type AdminRouteOptions = {
  admin?: {
    token?: string;
  };
};

export function requireAdminToken(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedToken: string | undefined,
): boolean {
  const token = expectedToken?.trim();
  if (!token) {
    reply.status(503).send({ error: "Admin API token is not configured." });
    return false;
  }

  if (getProvidedAdminToken(request) !== token) {
    reply.status(401).send({ error: "Admin API token is invalid or missing." });
    return false;
  }

  return true;
}

function getProvidedAdminToken(request: FastifyRequest): string | null {
  const explicitHeader = readHeaderValue(request.headers["x-admin-token"]);
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
