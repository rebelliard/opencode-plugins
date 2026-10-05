import { BUILT_IN_STYLES, DEFAULT_STYLE } from "./styles.ts";

export const DEFAULT_EXCLUDE_AGENTS: readonly string[] = ["plan"];

export type CustomStyleSource = string | { file: string };

export interface OutputStyleOptions {
  style: string;
  excludeAgents: readonly string[];
  styles: Readonly<Record<string, CustomStyleSource>>;
}

/** Reads plugin options defensively. Wrong types fall back to defaults. */
export function parseOptions(value: unknown): OutputStyleOptions {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const style =
    typeof record.style === "string" && record.style.trim() !== ""
      ? record.style.trim()
      : DEFAULT_STYLE;

  const excludeAgents = Array.isArray(record.excludeAgents)
    ? record.excludeAgents.filter(
        (entry): entry is string => typeof entry === "string" && entry !== "",
      )
    : DEFAULT_EXCLUDE_AGENTS;

  const styles: Record<string, CustomStyleSource> = {};
  if (
    record.styles &&
    typeof record.styles === "object" &&
    !Array.isArray(record.styles)
  ) {
    for (const [name, source] of Object.entries(record.styles)) {
      if (typeof source === "string") {
        styles[name] = source;
      } else if (
        source &&
        typeof source === "object" &&
        typeof (source as { file?: unknown }).file === "string"
      ) {
        styles[name] = { file: (source as { file: string }).file };
      }
    }
  }

  return { style, excludeAgents, styles };
}

/** Matches an agent ID against exact names and `prefix*` patterns. */
export function isExcluded(
  agent: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith("*")
      ? agent.startsWith(pattern.slice(0, -1))
      : agent === pattern,
  );
}

export interface ResolvedStyle {
  /** The style name that applies. */
  name: string;
  /** The text to append, or undefined for a no-op style. */
  text: string | undefined;
  /** True when `requested` named no known style and the default was used. */
  fellBack: boolean;
}

/**
 * Picks a style by name. A custom style shadows a built-in of the same name.
 * An unknown name falls back to the default style.
 */
export function resolveStyle(
  requested: string,
  custom: ReadonlyMap<string, string>,
): ResolvedStyle {
  if (custom.has(requested)) {
    return { name: requested, text: custom.get(requested), fellBack: false };
  }
  if (Object.hasOwn(BUILT_IN_STYLES, requested)) {
    return {
      name: requested,
      text: BUILT_IN_STYLES[requested],
      fellBack: false,
    };
  }
  return {
    name: DEFAULT_STYLE,
    text: BUILT_IN_STYLES[DEFAULT_STYLE],
    fellBack: true,
  };
}

/** Names of every selectable style, built-ins first, without duplicates. */
export function styleNames(custom: ReadonlyMap<string, string>): string[] {
  return [...new Set([...Object.keys(BUILT_IN_STYLES), ...custom.keys()])];
}
