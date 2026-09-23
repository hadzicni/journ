export const PROVIDERS = ["ollama", "openai"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: "Ollama",
  openai: "OpenAI",
};

export type ProviderStatus =
  | "online"
  | "offline"
  | "unauthorized"
  | "error";

export type ProviderModels = {
  provider: Provider;
  status: ProviderStatus;
  models: string[];
};

// Only configured providers are listed; an empty list means none is set up.
export type ModelsResponse = { providers: ProviderModels[] };

// A picked model is "<provider>:<model>", e.g. "openai:gpt-4.1-mini" or
// "ollama:llama3.2:latest". Only the first colon separates the provider.
export function toModelId(provider: Provider, model: string) {
  return `${provider}:${model}`;
}

export function parseModelId(
  id: string
): { provider: Provider; model: string } | null {
  const i = id.indexOf(":");
  if (i < 0) return null;
  const provider = id.slice(0, i) as Provider;
  const model = id.slice(i + 1);
  if (!PROVIDERS.includes(provider) || !model) return null;
  return { provider, model };
}
