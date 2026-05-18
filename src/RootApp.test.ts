import { describe, expect, it } from "vitest";

import { getInitialEdition } from "./RootApp";

describe("RootApp edition selection", () => {
  it("defaults to the basic tool when no edition has been stored", () => {
    const storage = createStorage(null);

    expect(getInitialEdition(storage)).toBe("basic");
  });

  it("restores a previously selected platform edition", () => {
    const storage = createStorage("platform");

    expect(getInitialEdition(storage)).toBe("platform");
  });

  it("falls back to the basic tool for invalid stored values", () => {
    const storage = createStorage("unknown");

    expect(getInitialEdition(storage)).toBe("basic");
  });
});

function createStorage(value: string | null): Pick<Storage, "getItem"> {
  return {
    getItem: () => value,
  };
}
