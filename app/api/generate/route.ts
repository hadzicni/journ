import type { EntryOptions } from "@/lib/entry";
import {
  buildSystemPrompt,
  entrySchema,
  EXAMPLE_NOTES,
  exampleEntry,
} from "@/lib/prompt";

const MAX_NOTES_LENGTH = 10_000;
const MODEL_NAME = /^[\w.:/@+-]{1,200}$/;

function errorResponse(status: number, error: string, hint?: string) {
  return Response.json({ error, hint }, { status });
}

export async function POST(request: Request) {
  // Configured in .env.local (see .env.example).
  const ollamaUrl = process.env.OLLAMA_URL?.replace(/\/+$/, "");
  const apiKey = process.env.OLLAMA_API_KEY;

  if (!ollamaUrl) {
    return errorResponse(
      500,
      "Ollama isn't configured.",
      "Set OLLAMA_URL in your .env.local (see .env.example), then try again."
    );
  }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(
    ollamaUrl
  );

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Invalid request body.");
  }

  const { notes } = body;
  // The model picked in the UI, falling back to OLLAMA_MODEL.
  const model =
    typeof body.model === "string" && body.model
      ? body.model
      : process.env.OLLAMA_MODEL;
  const options: EntryOptions = {
    format: body.format === "prose" ? "prose" : "bullets",
    length: body.length === "detailed" ? "detailed" : "concise",
    matchLanguage: body.matchLanguage !== false,
  };

  if (!model) {
    return errorResponse(
      400,
      "No model selected.",
      "Pick a model, or set OLLAMA_MODEL in your .env.local."
    );
  }
  if (!MODEL_NAME.test(model)) {
    return errorResponse(400, "Invalid model name.");
  }

  if (typeof notes !== "string" || !notes.trim()) {
    return errorResponse(400, "Write a few notes about your day first.");
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return errorResponse(
      400,
      `Notes are too long (max ${MAX_NOTES_LENGTH.toLocaleString()} characters).`
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        model,
        stream: true,
        format: entrySchema(options),
        options: { temperature: 0.3 },
        messages: [
          { role: "system", content: buildSystemPrompt(options) },
          { role: "user", content: `My notes for today:\n\n${EXAMPLE_NOTES}` },
          { role: "assistant", content: exampleEntry(options) },
          { role: "user", content: `My notes for today:\n\n${notes.trim()}` },
        ],
      }),
      signal: request.signal,
    });
  } catch (err) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("Ollama request failed:", err);
    return errorResponse(
      503,
      `Can't reach Ollama at ${ollamaUrl}.`,
      isLocal
        ? "Make sure Ollama is running (open the Ollama app or run 'ollama serve'), then try again."
        : "Check OLLAMA_URL in your .env.local and your network connection, then try again."
    );
  }

  if (!upstream.ok) {
    const detail = await upstream
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);

    if (upstream.status === 401 || upstream.status === 403) {
      return errorResponse(
        502,
        apiKey
          ? `Ollama rejected the API key (${upstream.status}).`
          : `Ollama at ${ollamaUrl} requires an API key.`,
        apiKey
          ? "Check OLLAMA_API_KEY in your .env.local, then try again."
          : "Set OLLAMA_API_KEY in your .env.local, then try again."
      );
    }
    if (upstream.status === 404) {
      return errorResponse(
        502,
        `The model "${model}" isn't available in Ollama.`,
        isLocal
          ? `Pull it with "ollama pull ${model}", or pick another model.`
          : "Pick another model that's available on this server."
      );
    }
    return errorResponse(
      502,
      `Ollama returned an error (${upstream.status}).`,
      detail
    );
  }

  if (!upstream.body) {
    return errorResponse(502, "Ollama returned an empty response.");
  }

  // Ollama streams newline-delimited JSON chunks; forward only the generated
  // text, which is itself the entry's JSON as it's being written.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleLine = (
    line: string,
    controller: TransformStreamDefaultController<Uint8Array>
  ) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as {
      message?: { content?: string };
      error?: string;
    };
    if (chunk.error) throw new Error(chunk.error);
    if (chunk.message?.content) {
      controller.enqueue(encoder.encode(chunk.message.content));
    }
  };

  const stream = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(bytes, controller) {
        buffer += decoder.decode(bytes, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line, controller);
      },
      flush(controller) {
        handleLine(buffer + decoder.decode(), controller);
      },
    })
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
