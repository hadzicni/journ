import type { EntryOptions } from "@/lib/entry";
import {
  errorResponse,
  resolveModel,
  streamChat,
  type Message,
} from "@/lib/llm";
import {
  buildSystemPrompt,
  entrySchema,
  EXAMPLE_NOTES,
  exampleEntry,
} from "@/lib/prompt";

const MAX_NOTES_LENGTH = 10_000;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Invalid request body.");
  }

  const { notes } = body;
  const options: EntryOptions = {
    format: body.format === "prose" ? "prose" : "bullets",
    length: body.length === "detailed" ? "detailed" : "concise",
    matchLanguage: body.matchLanguage !== false,
  };

  const picked = resolveModel(body);
  if (picked instanceof Response) return picked;

  if (typeof notes !== "string" || !notes.trim()) {
    return errorResponse(400, "Write a few notes about your day first.");
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return errorResponse(
      400,
      `Notes are too long (max ${MAX_NOTES_LENGTH.toLocaleString()} characters).`
    );
  }

  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt(options) },
    { role: "user", content: `My notes for today:\n\n${EXAMPLE_NOTES}` },
    { role: "assistant", content: exampleEntry(options) },
    { role: "user", content: `My notes for today:\n\n${notes.trim()}` },
  ];

  return streamChat(request, picked, messages, {
    schema: entrySchema(options),
  });
}
