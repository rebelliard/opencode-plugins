import { describe, expect, it } from "vitest";
import {
  BUILT_IN_STYLES,
  CONCISE_CARVE_OUTS,
  DEFAULT_STYLE,
} from "./styles.ts";

describe("built-in styles", () => {
  it("defaults to concise", () => {
    expect(DEFAULT_STYLE).toBe("concise");
    expect(BUILT_IN_STYLES[DEFAULT_STYLE]).toBeTypeOf("string");
  });

  it("has a no-op default style", () => {
    expect(Object.hasOwn(BUILT_IN_STYLES, "default")).toBe(true);
    expect(BUILT_IN_STYLES.default).toBeUndefined();
  });

  it("keeps every carve-out in the concise text", () => {
    const text = BUILT_IN_STYLES.concise ?? "";
    for (const phrase of CONCISE_CARVE_OUTS) {
      expect(text, phrase).toContain(phrase);
    }
  });

  it("puts the carve-outs before the shortening rules", () => {
    const text = BUILT_IN_STYLES.concise ?? "";
    expect(text.indexOf("Never shorten these")).toBeGreaterThan(-1);
    expect(text.indexOf("Never shorten these")).toBeLessThan(
      text.indexOf("Keep short"),
    );
  });

  it("protects questions in full", () => {
    const text = BUILT_IN_STYLES.concise ?? "";
    expect(text).toMatch(/Never reduce a question to one line/);
    expect(text).toMatch(/win over every rule below/);
  });
});
