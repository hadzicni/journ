// Read on each call so changes to the environment apply without a rebuild.
export function getOllamaConfig() {
  return {
    url: process.env.OLLAMA_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_MODEL ?? "llama3.2:3b",
  };
}
