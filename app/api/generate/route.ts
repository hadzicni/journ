import type { EntryOptions } from "@/lib/entry";
import { parseModelId } from "@/lib/models";
import {
  buildSystemPrompt,
  entrySchema,
  EXAMPLE_NOTES,
  exampleEntry,
} from "@/lib/prompt";
import { defaultModelId, ollamaConfig, openaiConfig } from "@/lib/providers";

const MAX_NOTES_LENGTH = 10_000;
const MODEL_NAME = /^[\w.:/@+-]{1,200}$/;

type Message = { role: "system" | "user" | "assistant"; content: string };

function errorResponse(status: number, error: string, hint?: string) {
  return Response.json({ error, hint }, { status });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Invalid request body.");
  }

  const { notes } = body;
  // The model picked in the UI, falling back to OLLAMA_MODEL / OPENAI_MODEL.
  const modelId =
    typeof body.model === "string" && body.model
      ? body.model
      : defaultModelId();
  const options: EntryOptions = {
    format: body.format === "prose" ? "prose" : "bullets",
    length: body.length === "detailed" ? "detailed" : "concise",
    matchLanguage: body.matchLanguage !== false,
  };

  if (!modelId) {
    return errorResponse(
      400,
      "No model selected.",
      "Pick a model, or set OLLAMA_MODEL or OPENAI_MODEL in your .env.local."
    );
  }
  const picked = parseModelId(modelId);
  if (!picked || !MODEL_NAME.test(picked.model)) {
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

  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt(options) },
    { role: "user", content: `My notes for today:\n\n${EXAMPLE_NOTES}` },
    { role: "assistant", content: exampleEntry(options) },
    { role: "user", content: `My notes for today:\n\n${notes.trim()}` },
  ];

  const result =
    picked.provider === "openai"
      ? await generateWithOpenAI(request, picked.model, options, messages)
      : await generateWithOllama(request, picked.model, options, messages);
  if (result instanceof Response) return result;

  return new Response(result, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function generateWithOllama(
  request: Request,
  model: string,
  options: EntryOptions,
  messages: Message[]
): Promise<Response | ReadableStream<Uint8Array>> {
  const config = ollamaConfig();
  if (!config) {
    return errorResponse(
      500,
      "Ollama isn't configured.",
      "Set OLLAMA_URL in your .env.local (see .env.example), then try again."
    );
  }
  const { url, apiKey, isLocal } = config;

  let upstream: Response;
  try {
    upstream = await fetch(`${url}/api/chat`, {
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
        messages,
      }),
      signal: request.signal,
    });
  } catch (err) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("Ollama request failed:", err);
    return errorResponse(
      503,
      `Can't reach Ollama at ${url}.`,
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
          : `Ollama at ${url} requires an API key.`,
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
  return forwardLines(upstream.body, (line) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as {
      message?: { content?: string };
      error?: string;
    };
    if (chunk.error) throw new Error(chunk.error);
    return chunk.message?.content;
  });
}

async function generateWithOpenAI(
  request: Request,
  model: string,
  options: EntryOptions,
  messages: Message[]
): Promise<Response | ReadableStream<Uint8Array>> {
  const config = openaiConfig();
  if (!config) {
    return errorResponse(
      500,
      "OpenAI isn't configured.",
      "Set OPENAI_API_KEY in your .env.local (see .env.example), then try again."
    );
  }
  const { url, apiKey } = config;

  let upstream: Response;
  try {
    upstream = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      // No temperature: reasoning models (o-series, GPT-5) only accept the
      // default and reject the request otherwise.
      body: JSON.stringify({
        model,
        stream: true,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "journal_entry",
            strict: true,
            schema: entrySchema(options),
          },
        },
        messages,
      }),
      signal: request.signal,
    });
  } catch (err) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("OpenAI request failed:", err);
    return errorResponse(
      503,
      `Can't reach OpenAI at ${url}.`,
      "Check your network connection (and OPENAI_BASE_URL, if set), then try again."
    );
  }

  if (!upstream.ok) {
    const detail = await upstream
      .json()
      .then((body: { error?: { message?: string } }) => body.error?.message)
      .catch(() => undefined);

    if (upstream.status === 401 || upstream.status === 403) {
      return errorResponse(
        502,
        `OpenAI rejected the API key (${upstream.status}).`,
        detail ?? "Check OPENAI_API_KEY in your .env.local, then try again."
      );
    }
    if (upstream.status === 404) {
      return errorResponse(
        502,
        `The model "${model}" isn't available on OpenAI.`,
        "Pick another model, or check that your account has access to it."
      );
    }
    if (upstream.status === 429) {
      return errorResponse(
        502,
        "OpenAI rate limit or quota exceeded.",
        detail ?? "Wait a moment and try again, or check your OpenAI billing."
      );
    }
    return errorResponse(
      502,
      `OpenAI returned an error (${upstream.status}).`,
      detail
    );
  }

  if (!upstream.body) {
    return errorResponse(502, "OpenAI returned an empty response.");
  }

  // OpenAI streams server-sent events ("data: {...}"), ending with
  // "data: [DONE]"; forward only the generated text.
  return forwardLines(upstream.body, (line) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    const chunk = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null } }[];
      error?: { message?: string };
    };
    if (chunk.error) throw new Error(chunk.error.message ?? "OpenAI error");
    return chunk.choices?.[0]?.delta?.content ?? undefined;
  });
}

// Splits a byte stream into lines and forwards whatever text `handleLine`
// extracts from each one.
function forwardLines(
  body: ReadableStream<Uint8Array>,
  handleLine: (line: string) => string | undefined
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (
    line: string,
    controller: TransformStreamDefaultController<Uint8Array>
  ) => {
    const text = handleLine(line);
    if (text) controller.enqueue(encoder.encode(text));
  };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(bytes, controller) {
        buffer += decoder.decode(bytes, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) emit(line, controller);
      },
      flush(controller) {
        emit(buffer + decoder.decode(), controller);
      },
    })
  );
}
