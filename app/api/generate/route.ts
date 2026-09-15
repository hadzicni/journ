import { EXAMPLE_ENTRY, EXAMPLE_NOTES, SYSTEM_PROMPT } from "@/lib/prompt";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
const MAX_NOTES_LENGTH = 10_000;

function errorResponse(status: number, error: string, hint?: string) {
  return Response.json({ error, hint }, { status });
}

export async function POST(request: Request) {
  let notes: unknown;
  try {
    ({ notes } = await request.json());
  } catch {
    return errorResponse(400, "Invalid request body.");
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
    upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        options: { temperature: 0.3 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `My notes for today:\n\n${EXAMPLE_NOTES}` },
          { role: "assistant", content: EXAMPLE_ENTRY },
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
      `Can't reach Ollama at ${OLLAMA_URL}.`,
      "Make sure Ollama is running (open the Ollama app or run 'ollama serve'), then try again."
    );
  }

  if (!upstream.ok) {
    const detail = await upstream
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);

    if (upstream.status === 404) {
      return errorResponse(
        502,
        `The model "${MODEL}" isn't available in Ollama.`,
        `Pull it with "ollama pull ${MODEL}", then try again.`
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

  // Ollama streams newline-delimited JSON; forward only the generated text.
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
