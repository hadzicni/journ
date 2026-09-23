import { LANGUAGES, type EntryOptions } from "@/lib/entry";

const RULES = `Rules:
- Use ONLY information found in the notes. Never invent events, people, places, times, feelings, reasons, or outcomes.
- Keep every concrete detail from the notes: names, numbers, times, places.
- Keep separate items separate. Do not merge unrelated notes into one sentence or connect them with causes that are not stated.
- Preserve the status/outcome of each activity exactly as stated (e.g. "fixed" vs "started" vs "still working on" are not interchangeable).
- Write in the first person ("I"), past tense, in plain and natural language.
- Fix spelling, grammar, and shorthand, but do not change the meaning.
- If something in the notes is unclear, keep it close to the original wording rather than guessing.`;

const LANGUAGE_RULES = {
  match:
    'Write the entry in the same language the notes are written in, even though these instructions and the example are in English. Set "language" to that language\'s ISO 639-1 code.',
  english:
    'Write the entry in English, translating the notes if they are in another language. Set "language" to "en".',
};

const LENGTH_RULES = {
  concise: "Keep it concise: short, simple sentences without filler.",
  detailed:
    "Be detailed: write full, descriptive sentences that carry over all context and nuance from the notes, but still add nothing that isn't in them.",
};

const FORMAT_RULES = {
  bullets:
    'Put the entry in "items": one item per activity or event from the notes, in the order they happened when that is clear. Include everything from the notes — activities, feelings, and plans alike — each as its own item. Items are plain sentences without bullet characters or Markdown.',
  prose:
    'Put the entry in "text": flowing prose in one or more short paragraphs (separate paragraphs with a blank line) that covers everything from the notes — activities, feelings, and plans alike — in the order they happened when that is clear. No headings, lists, or Markdown.',
};

export function buildSystemPrompt(options: EntryOptions) {
  return [
    "You turn rough, messy notes about someone's day into a clean daily journal entry.",
    RULES,
    LANGUAGE_RULES[options.matchLanguage ? "match" : "english"],
    LENGTH_RULES[options.length],
    FORMAT_RULES[options.format],
    "Respond only with JSON that matches the given schema.",
  ].join("\n\n");
}

// The provider constrains the output to this JSON schema, so the entry always
// has the expected shape. "language" comes first so it's known before the text.
// It also satisfies OpenAI's strict mode: every property is required and no
// others are allowed.
export function entrySchema(options: EntryOptions) {
  return {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: options.matchLanguage ? LANGUAGES : ["en"],
      },
      ...(options.format === "bullets"
        ? { items: { type: "array", items: { type: "string" } } }
        : { text: { type: "string" } }),
    },
    required: ["language", options.format === "bullets" ? "items" : "text"],
    additionalProperties: false,
  };
}

export const EXAMPLE_NOTES = `dentist 8am. worked on quarterly report most of day, still not done ugh
dinner at home, watched a movie w/ alex
stressed about deadline
need to email tom re: budget numbers`;

const EXAMPLE_ITEMS = [
  "Went to the dentist at 8am.",
  "Worked on the quarterly report for most of the day; it isn't finished yet.",
  "Had dinner at home.",
  "Watched a movie with Alex.",
  "Felt stressed about the deadline.",
  "Need to email Tom about the budget numbers.",
];

const EXAMPLE_TEXT = `I went to the dentist at 8am and then worked on the quarterly report for most of the day, though it isn't finished yet.

In the evening I had dinner at home and watched a movie with Alex. I felt stressed about the deadline, and I still need to email Tom about the budget numbers.`;

export function exampleEntry(options: EntryOptions) {
  return JSON.stringify(
    options.format === "bullets"
      ? { language: "en", items: EXAMPLE_ITEMS }
      : { language: "en", text: EXAMPLE_TEXT }
  );
}
