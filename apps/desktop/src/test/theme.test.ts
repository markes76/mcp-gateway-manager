import { describe, expect, it } from "vitest";

import { applyTheme, resolveTheme } from "../lib/theme";

describe("theme helpers", () => {
  it("resolves explicit theme", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("applies data-theme attribute", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
