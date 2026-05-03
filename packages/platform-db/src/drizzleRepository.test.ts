import { describe, expect, it } from "vitest";

import { createDrizzlePlatformRepository, createNodePgDrizzleClient } from "./drizzleRepository";

describe("drizzle repository", () => {
  it("exposes a PostgreSQL-backed repository factory", () => {
    expect(typeof createDrizzlePlatformRepository).toBe("function");
    expect(typeof createNodePgDrizzleClient).toBe("function");
  });
});
