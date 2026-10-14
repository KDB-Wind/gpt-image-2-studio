// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { requestJsonWithTimeout, requestMultipartWithTimeout, type ProviderRequestConfig } from "./apiClient";
import { DEFAULT_CONFIG, type AppConfig } from "./config";
import { resolveImageBlob } from "./imagePayload";

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

it("aborts a real generated-image socket whose response body stalls", async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "image/png" });
    res.flushHeaders();
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/image.png`;
  await expect(resolveImageBlob({ url }, { ...DEFAULT_CONFIG, timeoutSeconds: 0.1 }))
    .rejects.toMatchObject({ code: "image-download-timeout", kind: "timeout" });
});

const transports = [
  ["JSON", (config: AppConfig, provider: ProviderRequestConfig) =>
    requestJsonWithTimeout(config, { path: "/images/generations", body: {} }, provider)],
  ["multipart", (config: AppConfig, provider: ProviderRequestConfig) =>
    requestMultipartWithTimeout(config, { path: "/images/edits", body: new FormData() }, provider)],
] as const;

describe.each(transports)("%s transport over real localhost HTTP", (_name, request) => {
  it("aborts a response whose headers arrive promptly but whose body stalls", async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.flushHeaders();
      // A real socket and response stream, not a mocked fetch promise.
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const config = { ...DEFAULT_CONFIG, timeoutSeconds: 0.1 };
    const provider = { ...DEFAULT_CONFIG.providerProfiles[0], baseUrl, apiKey: "example-key" };
    await expect(request(config, provider))
      .rejects.toMatchObject({ kind: "timeout" });
  });
});
