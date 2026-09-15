"use client";

import { useCallback, useEffect, useState } from "react";

import type { ModelsResponse } from "@/app/api/models/route";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const POLL_INTERVAL = 15_000;

type OllamaState = { status: ModelsResponse["status"] | "checking"; models: string[] };

async function fetchModels(): Promise<OllamaState> {
  try {
    const res = await fetch("/api/models", { cache: "no-store" });
    return (await res.json()) as ModelsResponse;
  } catch {
    return { status: "offline", models: [] };
  }
}

// Polls /api/models so the picker and status dot stay current, e.g. when
// Ollama is started or a model is pulled while the page is open.
export function useOllamaModels() {
  const [state, setState] = useState<OllamaState>({
    status: "checking",
    models: [],
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

  return { ...state, refresh };
}

// "llama3.2" and "llama3.2:latest" name the same model.
export function isInstalled(models: string[], model: string) {
  return models.includes(model) || models.includes(`${model}:latest`);
}

function describeStatus(state: OllamaState, model: string | undefined) {
  switch (state.status) {
    case "checking":
      return { tone: "checking", label: "Checking Ollama…" } as const;
    case "offline":
      return { tone: "error", label: "Ollama isn't reachable" } as const;
    case "unauthorized":
      return { tone: "error", label: "API key missing or rejected" } as const;
    case "unconfigured":
      return { tone: "error", label: "OLLAMA_URL isn't set" } as const;
    case "error":
      return { tone: "error", label: "Ollama returned an error" } as const;
    case "online":
      if (!model) return { tone: "warning", label: "No model selected" } as const;
      return isInstalled(state.models, model)
        ? ({ tone: "ready", label: "Ready" } as const)
        : ({ tone: "warning", label: "Model isn't installed" } as const);
  }
}

const DOT_TONES = {
  checking: "bg-muted-foreground/40 animate-pulse",
  ready: "bg-green-500 shadow-[0_0_0_3px] shadow-green-500/20",
  warning: "bg-amber-500 shadow-[0_0_0_3px] shadow-amber-500/20",
  error: "bg-red-500 shadow-[0_0_0_3px] shadow-red-500/20",
};

export function ModelSelect({
  state,
  value,
  onChange,
  disabled,
}: {
  state: OllamaState;
  value: string | undefined;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  const status = describeStatus(state, value);
  const options =
    value && !isInstalled(state.models, value)
      ? [value, ...state.models]
      : state.models;

  return (
    <Select
      value={value ?? null}
      onValueChange={(next) => next && onChange(next)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        title={`${value ?? "No model"} · ${status.label}`}
        className="h-7 max-w-52 min-w-0 gap-2 rounded-full border-0 bg-muted pr-2 pl-2.5 text-xs font-medium text-muted-foreground hover:text-foreground dark:bg-muted"
      >
        <span
          className={cn("size-2 shrink-0 rounded-full", DOT_TONES[status.tone])}
          aria-hidden
        />
        <span className="sr-only">{status.label}. Model:</span>
        <SelectValue className="min-w-0 truncate font-mono">
          {(selected: string | null) => selected ?? "No model"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        align="start"
        className="w-auto min-w-56 rounded-xl p-1"
      >
        <SelectGroup>
          <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                DOT_TONES[status.tone]
              )}
              aria-hidden
            />
            {status.label}
          </SelectLabel>
          {options.map((model) => (
            <SelectItem key={model} value={model} className="font-mono text-xs">
              {model}
              {state.status === "online" &&
                !isInstalled(state.models, model) && (
                <span className="font-sans text-muted-foreground">
                  not installed
                </span>
              )}
            </SelectItem>
          ))}
          {options.length === 0 && (
            <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">
              No models available.
            </p>
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
