"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  parseModelId,
  PROVIDER_LABELS,
  toModelId,
  type ModelsResponse,
  type Provider,
  type ProviderModels,
} from "@/lib/models";
import { cn } from "@/lib/utils";

const POLL_INTERVAL = 15_000;

type ModelsState = { checking: boolean; providers: ProviderModels[] };

async function fetchModels(): Promise<ModelsState> {
  try {
    const res = await fetch("/api/models", { cache: "no-store" });
    const data = (await res.json()) as ModelsResponse;
    return { checking: false, providers: data.providers };
  } catch {
    // The app's own server is unreachable; treat every provider as offline.
    return { checking: false, providers: [] };
  }
}

// Polls /api/models so the picker and status dot stay current, e.g. when
// Ollama is started or a model is pulled while the page is open.
export function useModels() {
  const [state, setState] = useState<ModelsState>({
    checking: true,
    providers: [],
  });

  const refresh = useCallback(() => {
    fetchModels().then(setState);
  }, []);

  useEffect(() => {
    fetchModels().then(setState);
    const interval = setInterval(refresh, POLL_INTERVAL);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  // The first available model, used when no default model is configured.
  const firstModel = state.providers
    .flatMap((p) => p.models.map((m) => toModelId(p.provider, m)))
    .at(0);

  return { ...state, firstModel, refresh };
}

// For Ollama, "llama3.2" and "llama3.2:latest" name the same model.
function isAvailable(provider: Provider, models: string[], model: string) {
  return (
    models.includes(model) ||
    (provider === "ollama" && models.includes(`${model}:latest`))
  );
}

type Tone = "checking" | "ready" | "warning" | "error";

function describeProvider(p: ProviderModels): { tone: Tone; label: string } {
  const name = PROVIDER_LABELS[p.provider];
  switch (p.status) {
    case "offline":
      return { tone: "error", label: `${name} isn't reachable` };
    case "unauthorized":
      return { tone: "error", label: `${name} API key missing or rejected` };
    case "error":
      return { tone: "error", label: `${name} returned an error` };
    case "online":
      return { tone: "ready", label: name };
  }
}

function describeStatus(
  state: ModelsState,
  value: string | undefined
): { tone: Tone; label: string } {
  if (state.checking) return { tone: "checking", label: "Checking models…" };
  if (state.providers.length === 0) {
    return { tone: "error", label: "No provider configured" };
  }
  const picked = value ? parseModelId(value) : null;
  if (!picked) return { tone: "warning", label: "No model selected" };

  const provider = state.providers.find((p) => p.provider === picked.provider);
  if (!provider) {
    return {
      tone: "error",
      label: `${PROVIDER_LABELS[picked.provider]} isn't configured`,
    };
  }
  if (provider.status !== "online") return describeProvider(provider);
  return isAvailable(provider.provider, provider.models, picked.model)
    ? { tone: "ready", label: "Ready" }
    : {
        tone: "warning",
        label:
          provider.provider === "ollama"
            ? "Model isn't installed"
            : "Model isn't available",
      };
}

const DOT_TONES = {
  checking: "bg-muted-foreground/40 animate-pulse",
  ready: "bg-green-500 shadow-[0_0_0_3px] shadow-green-500/20",
  warning: "bg-amber-500 shadow-[0_0_0_3px] shadow-amber-500/20",
  error: "bg-red-500 shadow-[0_0_0_3px] shadow-red-500/20",
};

function Dot({ tone }: { tone: Tone }) {
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", DOT_TONES[tone])}
      aria-hidden
    />
  );
}

export function ModelSelect({
  state,
  value,
  onChange,
  disabled,
}: {
  state: ModelsState;
  value: string | undefined;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  const status = describeStatus(state, value);
  const picked = value ? parseModelId(value) : null;

  // Keep the picked model listed even when its provider doesn't offer it.
  const groups = state.providers.map((p) =>
    picked?.provider === p.provider &&
    !isAvailable(p.provider, p.models, picked.model)
      ? { ...p, models: [picked.model, ...p.models] }
      : p
  );

  return (
    <Select
      value={value ?? null}
      onValueChange={(next) => next && onChange(next)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        title={`${
          picked
            ? `${picked.model} (${PROVIDER_LABELS[picked.provider]})`
            : "No model"
        } · ${status.label}`}
        className="h-7 max-w-52 min-w-0 gap-2 rounded-full border-0 bg-muted pr-2 pl-2.5 text-xs font-medium text-muted-foreground hover:text-foreground dark:bg-muted"
      >
        <Dot tone={status.tone} />
        <span className="sr-only">{status.label}. Model:</span>
        <SelectValue className="min-w-0 truncate font-mono">
          {(selected: string | null) =>
            (selected && parseModelId(selected)?.model) ?? "No model"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        align="start"
        className="max-h-80 w-auto min-w-56 rounded-xl p-1"
      >
        {groups.length === 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
              <Dot tone={status.tone} />
              {status.label}
            </SelectLabel>
            <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">
              Set OLLAMA_URL or OPENAI_API_KEY in your .env.local.
            </p>
          </SelectGroup>
        )}
        {groups.map((group, i) => {
          const groupStatus = state.checking
            ? ({ tone: "checking", label: PROVIDER_LABELS[group.provider] } as const)
            : describeProvider(group);
          return (
            <Fragment key={group.provider}>
              {i > 0 && <SelectSeparator />}
              <SelectGroup>
                <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
                  <Dot tone={groupStatus.tone} />
                  {groupStatus.label}
                </SelectLabel>
                {group.models.map((model) => (
                  <SelectItem
                    key={model}
                    value={toModelId(group.provider, model)}
                    className="font-mono text-xs"
                  >
                    {model}
                    {group.status === "online" &&
                      !isAvailable(
                        group.provider,
                        state.providers[i].models,
                        model
                      ) && (
                        <span className="font-sans text-muted-foreground">
                          {group.provider === "ollama"
                            ? "not installed"
                            : "not available"}
                        </span>
                      )}
                  </SelectItem>
                ))}
                {group.models.length === 0 && (
                  <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">
                    No models available.
                  </p>
                )}
              </SelectGroup>
            </Fragment>
          );
        })}
      </SelectContent>
    </Select>
  );
}
