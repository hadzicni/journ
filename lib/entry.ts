export type EntryFormat = "bullets" | "prose";
export type EntryLength = "concise" | "detailed";

export type EntryOptions = {
  format: EntryFormat;
  length: EntryLength;
  matchLanguage: boolean;
};

// The entry is split into these sections, in this order. Sections the notes
// have nothing for stay empty and are left out.
export const SECTIONS = ["done", "feelings", "plans"] as const;
export type Section = (typeof SECTIONS)[number];

// Bullets come as a list of items per section, prose as a single text.
export type EntryData = {
  language?: string;
} & Partial<Record<Section, string[] | string>>;

// ISO 639-1 codes the model may answer with. A fixed list keeps small models
// from replying with names like "deutsch".
export const LANGUAGES = [
  "en", "de", "fr", "es", "it", "pt", "nl", "sv", "da", "no", "fi", "pl",
  "cs", "sk", "sl", "hr", "sr", "bs", "hu", "ro", "bg", "el", "tr", "ru",
  "uk", "ar", "he", "hi", "ja", "ko", "zh", "id", "vi", "th",
] as const;

type Language = (typeof LANGUAGES)[number];

// Section headings per language. Noun phrases where a verb would need a
// gendered form (e.g. Polish, Czech, Russian).
const HEADINGS: Record<Language, Record<Section, string>> = {
  en: { done: "What I did", feelings: "How I felt", plans: "Plans" },
  de: { done: "Was ich gemacht habe", feelings: "Wie es mir ging", plans: "Pläne" },
  fr: { done: "Ce que j'ai fait", feelings: "Mon ressenti", plans: "À venir" },
  es: { done: "Lo que hice", feelings: "Cómo me sentí", plans: "Planes" },
  it: { done: "Cosa ho fatto", feelings: "Stato d'animo", plans: "Piani" },
  pt: { done: "O que fiz", feelings: "Como me senti", plans: "Planos" },
  nl: { done: "Wat ik heb gedaan", feelings: "Hoe ik me voelde", plans: "Plannen" },
  sv: { done: "Vad jag gjorde", feelings: "Hur jag mådde", plans: "Planer" },
  da: { done: "Hvad jeg lavede", feelings: "Hvordan jeg havde det", plans: "Planer" },
  no: { done: "Hva jeg gjorde", feelings: "Hvordan jeg hadde det", plans: "Planer" },
  fi: { done: "Mitä tein", feelings: "Miltä tuntui", plans: "Suunnitelmat" },
  pl: { done: "Mój dzień", feelings: "Samopoczucie", plans: "Plany" },
  cs: { done: "Můj den", feelings: "Pocity", plans: "Plány" },
  sk: { done: "Môj deň", feelings: "Pocity", plans: "Plány" },
  sl: { done: "Moj dan", feelings: "Občutki", plans: "Načrti" },
  hr: { done: "Moj dan", feelings: "Osjećaji", plans: "Planovi" },
  sr: { done: "Moj dan", feelings: "Osećanja", plans: "Planovi" },
  bs: { done: "Moj dan", feelings: "Osjećaji", plans: "Planovi" },
  hu: { done: "Mit csináltam", feelings: "Hogy éreztem magam", plans: "Tervek" },
  ro: { done: "Ce am făcut", feelings: "Cum m-am simțit", plans: "Planuri" },
  bg: { done: "Какво направих", feelings: "Как се чувствах", plans: "Планове" },
  el: { done: "Τι έκανα", feelings: "Πώς ένιωσα", plans: "Σχέδια" },
  tr: { done: "Neler yaptım", feelings: "Nasıl hissettim", plans: "Planlar" },
  ru: { done: "Мой день", feelings: "Чувства", plans: "Планы" },
  uk: { done: "Мій день", feelings: "Почуття", plans: "Плани" },
  ar: { done: "ما قمت به", feelings: "مشاعري", plans: "خططي" },
  he: { done: "מה עשיתי", feelings: "איך הרגשתי", plans: "תוכניות" },
  hi: { done: "मैंने क्या किया", feelings: "मेरी भावनाएँ", plans: "योजनाएँ" },
  ja: { done: "やったこと", feelings: "気持ち", plans: "予定" },
  ko: { done: "한 일", feelings: "기분", plans: "계획" },
  zh: { done: "做了什么", feelings: "心情", plans: "计划" },
  id: { done: "Yang saya lakukan", feelings: "Perasaan saya", plans: "Rencana" },
  vi: { done: "Những việc tôi đã làm", feelings: "Cảm xúc", plans: "Kế hoạch" },
  th: { done: "สิ่งที่ทำ", feelings: "ความรู้สึก", plans: "แผน" },
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

function toSection(value: unknown): string[] | string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return undefined;
}

export function toEntryData(value: unknown): EntryData {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const data: EntryData = {
    language:
      typeof record.language === "string" ? record.language : undefined,
  };
  for (const section of SECTIONS) data[section] = toSection(record[section]);
  return data;
}

function sectionBody(value: string[] | string | undefined) {
  if (Array.isArray(value)) {
    return value
      .map((item) => item.trim().replace(/^[-*•]\s+/, ""))
      .filter(Boolean)
      .map((item) => `- ${item}`)
      .join("\n");
  }
  return (value ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function hasContent(data: EntryData) {
  return SECTIONS.some((section) => sectionBody(data[section]));
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
  const language = data.language?.toLowerCase().slice(0, 2) || "en";
  const headings = HEADINGS[language as Language] ?? HEADINGS.en;

  const sections = SECTIONS.flatMap((section) => {
    const body = sectionBody(data[section]);
    return body ? [`## ${headings[section]}\n\n${body}`] : [];
  });
  if (sections.length === 0) return "";

  return [`# ${formatDate(date, language)}`, ...sections].join("\n\n");
}
