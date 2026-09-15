export type ModelsResponse = {
  status: "online" | "offline" | "unauthorized" | "unconfigured" | "error";
  models: string[];
};

function reply(status: ModelsResponse["status"], models: string[] = []) {
  return Response.json({ status, models } satisfies ModelsResponse, {
    headers: { "Cache-Control": "no-store" },
  });
}

// Lists the models installed on the configured Ollama server. The UI polls
// this for the model picker and its status dot.
export async function GET() {
  const ollamaUrl = process.env.OLLAMA_URL?.replace(/\/+$/, "");
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!ollamaUrl) return reply("unconfigured");

  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return reply("unauthorized");
    if (!res.ok) return reply("error");

    const data = (await res.json()) as { models?: { name?: string }[] };
    const models = (data.models ?? [])
      .map((m) => m.name)
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
    return reply("online", models);
  } catch {
    return reply("offline");
  }
}
