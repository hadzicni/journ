import { EXAMPLE_ENTRY, EXAMPLE_NOTES, SYSTEM_PROMPT } from "@/lib/prompt";

const MAX_NOTES_LENGTH = 10_000;

function errorResponse(status: number, error: string, hint?: string) {
  return Response.json({ error, hint }, { status });
}

export async function POST(request: Request) {
  // Configured in .env.local (see .env.example).
  const ollamaUrl = process.env.OLLAMA_URL?.replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL;
  const apiKey = process.env.OLLAMA_API_KEY;

  if (!ollamaUrl || !model) {
    return errorResponse(
      500,
      "Ollama isn't configured.",
      "Set OLLAMA_URL and OLLAMA_MODEL in your .env.local (see .env.example), then try again."
    );
  }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(
    ollamaUrl
  );

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
    upstream = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        model,
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
          ? `Pull it with "ollama pull ${model}", then try again.`
          : "Check that OLLAMA_MODEL in your .env.local names a model available on this server."
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
