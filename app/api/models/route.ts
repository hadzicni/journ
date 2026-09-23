import type {
  ModelsResponse,
  ProviderModels,
  ProviderStatus,
} from "@/lib/models";
import { isOpenAIChatModel, ollamaConfig, openaiConfig } from "@/lib/providers";

async function listModels(
  url: string,
  apiKey: string | undefined,
  parse: (data: unknown) => string[]
): Promise<{ status: ProviderStatus; models: string[] }> {
  try {
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return { status: "unauthorized", models: [] };
    }
    if (!res.ok) return { status: "error", models: [] };

    const models = parse(await res.json())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return { status: "online", models };
  } catch (err) {
    // e.g. a TLS error for a server whose CA Node doesn't trust.
    const cause = (err as { cause?: { code?: string; message?: string } })
      .cause;
    console.warn(
      `Can't list models at ${url}:`,
      cause?.code ?? cause?.message ?? err
    );
    return { status: "offline", models: [] };
  }
}

// Lists the models of every configured provider. The UI polls this for the
// model picker and its status dot.
export async function GET() {
  const ollama = ollamaConfig();
  const openai = openaiConfig();

  const providers = await Promise.all([
    ollama &&
      listModels(`${ollama.url}/api/tags`, ollama.apiKey, (data) =>
        ((data as { models?: { name?: string }[] }).models ?? []).map(
          (m) => m.name ?? ""
        )
      ).then((r): ProviderModels => ({ provider: "ollama", ...r })),
    openai &&
      listModels(`${openai.url}/models`, openai.apiKey, (data) =>
        ((data as { data?: { id?: string }[] }).data ?? [])
          .map((m) => m.id ?? "")
          // Custom base URLs (OpenAI-compatible servers) list their own models.
          .filter((id) => !openai.isDefaultUrl || isOpenAIChatModel(id))
      ).then((r): ProviderModels => ({ provider: "openai", ...r })),
  ]);

  return Response.json(
    {
      providers: providers.filter((p): p is ProviderModels => !!p),
    } satisfies ModelsResponse,
    { headers: { "Cache-Control": "no-store" } }
  );
}
