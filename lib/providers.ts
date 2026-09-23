import { toModelId, type Provider } from "@/lib/models";

// Server-side provider settings, configured in .env.local (see .env.example).

export const OPENAI_DEFAULT_URL = "https://api.openai.com/v1";

export function ollamaConfig() {
  const url = process.env.OLLAMA_URL?.replace(/\/+$/, "");
  if (!url) return null;
  return {
    url,
    apiKey: process.env.OLLAMA_API_KEY || undefined,
    isLocal: /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(url),
  };
}

export function openaiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const url = (process.env.OPENAI_BASE_URL || OPENAI_DEFAULT_URL).replace(
    /\/+$/,
    ""
  );
  return { url, apiKey, isDefaultUrl: url === OPENAI_DEFAULT_URL };
}

export function isConfigured(provider: Provider) {
  return provider === "ollama" ? !!ollamaConfig() : !!openaiConfig();
}

// The model preselected in the UI: OLLAMA_MODEL, else OPENAI_MODEL.
export function defaultModelId() {
  if (ollamaConfig() && process.env.OLLAMA_MODEL) {
    return toModelId("ollama", process.env.OLLAMA_MODEL);
  }
  if (openaiConfig() && process.env.OPENAI_MODEL) {
    return toModelId("openai", process.env.OPENAI_MODEL);
  }
  return undefined;
}

// OpenAI's /models also lists embedding, audio, image and moderation models,
// plus dated snapshots of every chat model. Keep the chat models only.
export function isOpenAIChatModel(id: string) {
  return (
    /^(gpt-|o\d|chatgpt-)/.test(id) &&
    !/(audio|realtime|tts|transcribe|image|search|instruct|codex|-\d{4}-\d{2}-\d{2}$)/.test(
      id
    )
  );
}
