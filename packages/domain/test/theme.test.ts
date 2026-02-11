import { describe, expect, it } from "vitest";

import { isThemeMode } from "../src/theme";

describe("isThemeMode", () => {
  it("accepts supported theme modes", () => {
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("system")).toBe(true);
  });

  it("rejects unsupported values", () => {
    expect(isThemeMode("LIGHT")).toBe(false);
    expect(isThemeMode("sepia")).toBe(false);
  });
});
