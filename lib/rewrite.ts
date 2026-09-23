// Writing Tools: rewrite a selected passage of the entry.

export const REWRITE_ACTIONS = [
  "rephrase",
  "shorter",
  "longer",
  "warmer",
] as const;
export type RewriteAction = (typeof REWRITE_ACTIONS)[number];

export const REWRITE_LABELS: Record<RewriteAction, string> = {
  rephrase: "Rephrase",
  shorter: "Shorter",
  longer: "Longer",
  warmer: "Warmer",
};

const INSTRUCTIONS: Record<RewriteAction, string> = {
  rephrase: "Rephrase the passage with different wording, keeping its meaning.",
  shorter: "Make the passage noticeably shorter, keeping its key facts.",
  longer:
    "Make the passage more detailed and descriptive, drawing only on details from the notes. If the notes have nothing more on it, only make the wording fuller.",
  warmer:
    "Make the passage warmer and more personal in tone, without adding facts, feelings, or reasons that aren't in the notes.",
};

export function buildRewritePrompt({
  action,
  singleLine,
}: {
  action: RewriteAction;
  singleLine: boolean;
}) {
  return [
    "You help someone polish a passage of their personal journal entry.",
    INSTRUCTIONS[action],
    "Use only information from the passage, the entry, and the notes it was written from. Never invent events, people, places, times, feelings, reasons, or outcomes, and keep every name and number.",
    "Keep the passage's language, first person, and tense.",
    singleLine
      ? "The passage is a single bullet point, so reply with a single line."
      : "Reply with the passage only.",
    "Reply with only the rewritten passage as plain text: no quotes, no Markdown, no explanations.",
  ].join("\n\n");
}
