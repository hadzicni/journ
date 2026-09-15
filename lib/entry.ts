export type EntryFormat = "bullets" | "prose";
export type EntryLength = "concise" | "detailed";

export type EntryOptions = {
  format: EntryFormat;
  length: EntryLength;
  matchLanguage: boolean;
};

export type EntryData = {
  language?: string;
  items?: string[];
  text?: string;
};

// ISO 639-1 codes the model may answer with. A fixed list keeps small models
// from replying with names like "deutsch".
export const LANGUAGES = [
  "en", "de", "fr", "es", "it", "pt", "nl", "sv", "da", "no", "fi", "pl",
  "cs", "sk", "sl", "hr", "sr", "bs", "hu", "ro", "bg", "el", "tr", "ru",
  "uk", "ar", "he", "hi", "ja", "ko", "zh", "id", "vi", "th",
] as const;

const WHAT_I_DID: Record<string, string> = {
  en: "What I did",
  de: "Was ich gemacht habe",
  fr: "Ce que j'ai fait",
  es: "Lo que hice",
  it: "Cosa ho fatto",
  pt: "O que fiz",
  nl: "Wat ik heb gedaan",
  sv: "Vad jag gjorde",
  da: "Hvad jeg lavede",
  no: "Hva jeg gjorde",
  pl: "Mój dzień",
  hr: "Moj dan",
  sr: "Moj dan",
  bs: "Moj dan",
  tr: "Neler yaptım",
};

// Parses JSON that may still be streaming in, by closing whatever is open.
// A half-written string value is kept (so text can appear word by word);
// anything that can't be completed yet, like a half-written key, is dropped.
export function parsePartialJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {}

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let stringIsKey = false;
  let expectKey = false;
  let safeEnd = 0;
  let safeStack: string[] = [];

  const markSafe = (end: number) => {
    safeEnd = end;
    safeStack = [...stack];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        if (!stringIsKey) markSafe(i + 1);
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      stringIsKey = stack.at(-1) === "{" && expectKey;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch);
      expectKey = ch === "{";
      markSafe(i + 1);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      expectKey = false;
      markSafe(i + 1);
    } else if (ch === ":") {
      expectKey = false;
    } else if (ch === ",") {
      expectKey = stack.at(-1) === "{";
    }
  }

  const close = (openers: string[]) =>
    [...openers]
      .reverse()
      .map((c) => (c === "{" ? "}" : "]"))
      .join("");

  const candidates: string[] = [];
  if (inString && !stringIsKey) {
    const partial = text.replace(/\\u[0-9a-fA-F]{0,3}$|\\$/, "");
    candidates.push(partial + '"' + close(stack));
  }
  candidates.push(text.slice(0, safeEnd) + close(safeStack));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return undefined;
}

export function toEntryData(value: unknown): EntryData {
  if (!value || typeof value !== "object") return {};
  const { language, items, text } = value as Record<string, unknown>;
  return {
    language: typeof language === "string" ? language : undefined,
    items: Array.isArray(items)
      ? items.filter((item): item is string => typeof item === "string")
      : undefined,
    text: typeof text === "string" ? text : undefined,
  };
}

export function hasContent(data: EntryData) {
  return Boolean(
    data.items?.some((item) => item.trim()) || data.text?.trim()
  );
}

function formatDate(date: Date, language: string) {
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  } as const;
  try {
    return date.toLocaleDateString(language, options);
  } catch {
    return date.toLocaleDateString("en", options);
  }
}

export function entryToMarkdown(data: EntryData, date: Date) {
  if (!hasContent(data)) return "";

  const language = data.language?.toLowerCase().slice(0, 2) || "en";
  const heading = WHAT_I_DID[language] ?? WHAT_I_DID.en;

  const body = data.items
    ? data.items
        .map((item) => item.trim().replace(/^[-*•]\s+/, ""))
        .filter(Boolean)
        .map((item) => `- ${item}`)
        .join("\n")
    : (data.text ?? "")
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .join("\n\n");

  return `# ${formatDate(date, language)}\n\n## ${heading}\n\n${body}`;
}
