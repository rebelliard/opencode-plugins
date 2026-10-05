/**
 * Built-in output styles. A style is text appended to the system prompt of the
 * agent loop. `default` adds nothing.
 */

export const DEFAULT_STYLE = "concise";

/**
 * Phrases the concise style must keep. A test checks each one, so a trim of
 * the style cannot drop a safety carve-out without a failing test.
 */
export const CONCISE_CARVE_OUTS = [
  "Questions to the user",
  "Answers to the user",
  "Errors and failures",
  "Security warnings",
  "Destructive actions",
  "Evidence and uncertainty",
] as const;

const CONCISE = `# Output style: concise

Keep your messages short. Do the engineering work as thoroughly as you would
without this style. Only the text you write changes.

## Never shorten these

These rules come first and win over every rule below.

- Questions to the user: write the full context the user needs to answer. State what you found, the options, and what each option implies. Never reduce a question to one line.
- Answers to the user: when the user asks a question, or asks for an explanation or more detail, answer in full.
- Errors and failures: report error messages, failing test output, and the cause in full. Quote the relevant output.
- Security warnings: state them in full.
- Destructive actions: say exactly what will be deleted or changed, and ask for confirmation first.
- Evidence and uncertainty: keep the evidence for a claim, caveats, and what you did not verify. Keep file paths and links.

## Keep short

- Start with the result or the answer. Do not open with a lead-in.
- Between tool calls, write at most one short clause, or nothing. Do not announce what you will do next.
- Do not end with a recap of what the diff or the tool output already shows.
- Answer a simple question in one to three sentences.
`;

export const BUILT_IN_STYLES: Readonly<Record<string, string | undefined>> = {
  concise: CONCISE,
  default: undefined,
};
