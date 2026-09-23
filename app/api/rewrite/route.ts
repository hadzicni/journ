import { errorResponse, resolveModel, streamChat } from "@/lib/llm";
import {
  buildRewritePrompt,
  REWRITE_ACTIONS,
  type RewriteAction,
} from "@/lib/rewrite";

const MAX_LENGTH = 10_000;

const isText = (value: unknown, max = MAX_LENGTH): value is string =>
  typeof value === "string" && value.length <= max;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Invalid request body.");
  }

  const { passage, entry, notes, action } = body;
  if (!REWRITE_ACTIONS.includes(action as RewriteAction)) {
    return errorResponse(400, "Unknown writing tool.");
  }
  if (!isText(passage, 2_000) || !passage.trim()) {
    return errorResponse(400, "Select a shorter passage to rewrite.");
  }
  if (!isText(entry) || !isText(notes)) {
    return errorResponse(400, "The entry or notes are too long.");
  }

  const picked = resolveModel(body);
  if (picked instanceof Response) return picked;

  return streamChat(
    request,
    picked,
    [
      {
        role: "system",
        content: buildRewritePrompt({
          action: action as RewriteAction,
          singleLine: body.singleLine === true,
        }),
      },
      {
        role: "user",
        content: `My notes:\n\n${notes.trim() || "(none)"}\n\nThe journal entry:\n\n${entry.trim()}\n\nThe passage to rewrite:\n\n${passage.trim()}`,
      },
    ],
    { temperature: 0.6 }
  );
}
