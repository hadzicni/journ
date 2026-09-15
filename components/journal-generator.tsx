"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
} from "lucide-react";

import { JournalEntry } from "@/components/journal-entry";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type GenerationError = { title: string; hint?: string };

const PLACEHOLDER = `standup 9:30, fixed the login redirect bug finally
lunch w/ sara at the thai place
afternoon mostly code review, 3 PRs
felt kinda tired but productive
tmrw: finish the migration script`;

function formatToday() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const EMPTY_BULLET = /^\s*[-*]\s*$/;

// Small models don't always follow the format exactly, so tidy the output:
// drop a chatty preamble ("Here is your journal entry:"), empty bullets,
// sections the model left empty, and normalize "*" bullets to "-".
function cleanEntry(text: string) {
  const firstHeading = text.search(/^## /m);
  if (firstHeading > 0) {
    const preamble = text.slice(0, firstHeading);
    if (preamble.length < 200 && !/^\s*[-*]\s/m.test(preamble)) {
      text = text.slice(firstHeading);
    }
  }

  const sections: string[][] = [[]];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) sections.push([]);
    if (!EMPTY_BULLET.test(line)) {
      sections[sections.length - 1].push(line.replace(/^(\s*)\* /, "$1- "));
    }
  }

  return sections
    .filter(([first, ...rest]) =>
      first?.startsWith("## ") ? rest.some((l) => l.trim()) : true
    )
    .map((lines) => lines.join("\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

// The Clipboard API is unavailable outside secure contexts (e.g. opening the
// app via a LAN IP) and can be blocked, so fall back to execCommand.
async function writeToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {}

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Copy command was rejected");
}

export function JournalGenerator() {
  const [notes, setNotes] = useState("");
  const [output, setOutput] = useState("");
  const [date, setDate] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<GenerationError | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(copiedTimer.current);
    },
    []
  );

  const body = cleanEntry(output);
  const entry = body ? `# ${date}\n\n${body}` : "";
  const canGenerate = notes.trim().length > 0 && !isGenerating;

  async function generate() {
    if (!canGenerate) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setError(null);
    setOutput("");
    setCopied(false);
    setDate(formatToday());

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError({
          title: data.error ?? `Something went wrong (${res.status}).`,
          hint: data.hint,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let received = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        setOutput(received);
      }

      if (!received.trim()) {
        setError({
          title: "The model returned an empty entry.",
          hint: "Try generating again, or add a bit more detail to your notes.",
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setError({
        title: "Generation was interrupted.",
        hint: "The connection to Ollama dropped before the entry was finished. Check that Ollama is still running and try again.",
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsGenerating(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function copy() {
    setError(null);
    try {
      await writeToClipboard(entry);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError({
        title: "Couldn't copy to clipboard.",
        hint: "Your browser blocked clipboard access. Select the text and copy it manually.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <label htmlFor="notes" className="sr-only">
          Notes about your day
        </label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              generate();
            }
          }}
          placeholder={PLACEHOLDER}
          className="max-h-96 min-h-40 resize-y p-3 leading-6 md:text-[0.95rem]"
          autoFocus
        />
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block">
            <kbd className="font-sans">⌘</kbd> + <kbd className="font-sans">Enter</kbd>{" "}
            to generate
          </p>
          <div className="ml-auto flex gap-2">
            {notes && !isGenerating && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setNotes("")}
              >
                Clear
              </Button>
            )}
            {isGenerating ? (
              <Button type="button" variant="outline" size="lg" onClick={stop}>
                <SquareIcon data-icon="inline-start" className="fill-current" />
                Stop
              </Button>
            ) : (
              <Button type="submit" size="lg" disabled={!canGenerate}>
                <SparklesIcon data-icon="inline-start" />
                Generate
              </Button>
            )}
          </div>
        </div>
      </form>

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{error.title}</AlertTitle>
          {error.hint && <AlertDescription>{error.hint}</AlertDescription>}
        </Alert>
      )}

      {(isGenerating || entry) && (
        <Card aria-busy={isGenerating}>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              {isGenerating && !entry ? (
                <>
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  Writing your entry…
                </>
              ) : (
                "Journal entry"
              )}
            </CardTitle>
            {entry && (
              <CardAction className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generate}
                  disabled={!canGenerate}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Regenerate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copy}
                  disabled={isGenerating}
                  aria-live="polite"
                >
                  {copied ? (
                    <CheckIcon data-icon="inline-start" />
                  ) : (
                    <CopyIcon data-icon="inline-start" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="py-2">
            {entry ? (
              <JournalEntry markdown={entry} />
            ) : (
              <div className="space-y-3 py-2" aria-hidden>
                <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
