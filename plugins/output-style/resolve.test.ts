import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXCLUDE_AGENTS,
  isExcluded,
  parseOptions,
  resolveStyle,
  styleNames,
} from "./resolve.ts";
import { BUILT_IN_STYLES } from "./styles.ts";

describe("parseOptions", () => {
  it("uses defaults for missing or wrong-typed options", () => {
    for (const value of [undefined, null, "x", 3, []]) {
      expect(parseOptions(value)).toEqual({
        style: "concise",
        excludeAgents: DEFAULT_EXCLUDE_AGENTS,
        styles: {},
      });
    }
  });

  it("reads and trims the style name", () => {
    expect(parseOptions({ style: " default " }).style).toBe("default");
    expect(parseOptions({ style: "  " }).style).toBe("concise");
    expect(parseOptions({ style: 5 }).style).toBe("concise");
  });

  it("replaces the exclude list and drops invalid entries", () => {
    expect(
      parseOptions({ excludeAgents: ["review*", 3, "", "plan"] }).excludeAgents,
    ).toEqual(["review*", "plan"]);
    expect(parseOptions({ excludeAgents: [] }).excludeAgents).toEqual([]);
    expect(parseOptions({ excludeAgents: "plan" }).excludeAgents).toEqual(
      DEFAULT_EXCLUDE_AGENTS,
    );
  });

  it("reads inline and file styles and ignores invalid ones", () => {
    expect(
      parseOptions({
        styles: {
          terse: "Be terse.",
          loud: { file: "styles/loud.md" },
          bad: 3,
          alsoBad: { file: 4 },
          nope: null,
        },
      }).styles,
    ).toEqual({ terse: "Be terse.", loud: { file: "styles/loud.md" } });
    expect(parseOptions({ styles: [] }).styles).toEqual({});
    expect(parseOptions({ styles: "x" }).styles).toEqual({});
  });
});

describe("isExcluded", () => {
  it("matches exact names", () => {
    expect(isExcluded("plan", ["plan"])).toBe(true);
    expect(isExcluded("planner", ["plan"])).toBe(false);
    expect(isExcluded("build", [])).toBe(false);
  });

  it("matches prefix patterns", () => {
    expect(isExcluded("prosecutor-tests", ["prosecutor*"])).toBe(true);
    expect(isExcluded("prosecutor", ["prosecutor*"])).toBe(true);
    expect(isExcluded("build", ["prosecutor*"])).toBe(false);
  });

  it("excludes plan by default", () => {
    expect(isExcluded("plan", DEFAULT_EXCLUDE_AGENTS)).toBe(true);
    expect(isExcluded("build", DEFAULT_EXCLUDE_AGENTS)).toBe(false);
  });
});

describe("resolveStyle", () => {
  const none = new Map<string, string>();

  it("resolves built-ins", () => {
    expect(resolveStyle("concise", none)).toEqual({
      name: "concise",
      text: BUILT_IN_STYLES.concise,
      fellBack: false,
    });
    expect(resolveStyle("default", none)).toEqual({
      name: "default",
      text: undefined,
      fellBack: false,
    });
  });

  it("lets a custom style shadow a built-in", () => {
    const custom = new Map([["concise", "mine"]]);
    expect(resolveStyle("concise", custom).text).toBe("mine");
  });

  it("resolves custom styles", () => {
    expect(resolveStyle("terse", new Map([["terse", "Be terse."]]))).toEqual({
      name: "terse",
      text: "Be terse.",
      fellBack: false,
    });
  });

  it("falls back to concise for unknown names", () => {
    expect(resolveStyle("nope", none)).toEqual({
      name: "concise",
      text: BUILT_IN_STYLES.concise,
      fellBack: true,
    });
  });

  it("does not resolve inherited object keys", () => {
    expect(resolveStyle("toString", none).fellBack).toBe(true);
    expect(resolveStyle("__proto__", none).fellBack).toBe(true);
  });
});

describe("styleNames", () => {
  it("lists built-ins first without duplicates", () => {
    expect(styleNames(new Map())).toEqual(["concise", "default"]);
    expect(
      styleNames(
        new Map([
          ["terse", "x"],
          ["concise", "y"],
        ]),
      ),
    ).toEqual(["concise", "default", "terse"]);
  });
});
