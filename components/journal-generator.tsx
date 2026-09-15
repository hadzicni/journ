"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
} from "lucide-react";

import { JournalEntry } from "@/components/journal-entry";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

const spring = { type: "spring", bounce: 0, duration: 0.45 } as const;

// Content swaps (button labels, icons) slide and un-blur into place.
const swap = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(4px)" },
  transition: spring,
};

// Smoothly animates its height to fit its children as they grow.
function AutoHeight({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.borderBoxSize[0].blockSize)
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={{ type: "spring", bounce: 0, duration: 0.6 }}
      className="overflow-hidden"
    >
      <div ref={ref}>{children}</div>
    </motion.div>
  );
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
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...spring, duration: 0.8, delay: 0.1 }}
        >
          <div
            className="relative rounded-[28px]"
            data-generating={isGenerating}
          >
            <div className="journ-glow" data-blur aria-hidden />
            <div className="journ-glow" aria-hidden />
            <Card className="relative gap-0 rounded-[inherit] py-0 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-16px_rgb(0_0_0/0.18)] ring-black/[0.06] transition-shadow duration-300 focus-within:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_48px_-16px_rgb(0_0_0/0.24)] dark:ring-white/10">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isGenerating) stop();
                  else generate();
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
                  readOnly={isGenerating}
                  placeholder={PLACEHOLDER}
                  className={cn(
                    "max-h-[28rem] min-h-40 resize-none rounded-none border-0 bg-transparent px-6 pt-5 pb-2 text-[1.0625rem] leading-7 shadow-none transition-opacity duration-500 placeholder:text-muted-foreground/60 focus-visible:ring-0 md:text-[1.0625rem] dark:bg-transparent",
                    isGenerating && "opacity-40"
                  )}
                  autoFocus
                />
                <div className="flex items-center gap-2 px-3 pt-1 pb-3 pl-6">
                  <p className="hidden items-center gap-1 text-xs text-muted-foreground/80 sm:flex">
                    <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans">
                      ⌘
                    </kbd>
                    <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans">
                      ↵
                    </kbd>
                    <span className="ml-1">to generate</span>
                  </p>
                  <div className="ml-auto flex items-center gap-1.5">
                    <AnimatePresence initial={false}>
                      {notes && !isGenerating && (
                        <motion.div
                          key="clear"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={spring}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="lg"
                            className="h-10 rounded-full px-4 text-muted-foreground"
                            onClick={() => setNotes("")}
                          >
                            Clear
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <Button
                      type="submit"
                      size="lg"
                      disabled={!isGenerating && !notes.trim()}
                      className="relative h-10 min-w-30 overflow-hidden rounded-full px-5 text-[0.9375rem] transition-[scale,opacity,background-color] duration-200 active:scale-[0.96]"
                    >
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={isGenerating ? "stop" : "generate"}
                          {...swap}
                          className="flex items-center gap-2"
                        >
                          {isGenerating ? (
                            <>
                              <SquareIcon className="size-3 fill-current" />
                              Stop
                            </>
                          ) : (
                            <>
                              <SparklesIcon />
                              Generate
                            </>
                          )}
                        </motion.span>
                      </AnimatePresence>
                    </Button>
                  </div>
                </div>
              </form>
            </Card>
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={spring}
            >
              <Alert
                variant="destructive"
                className="rounded-2xl border-destructive/20 bg-destructive/[0.06] px-4 py-3"
              >
                <CircleAlertIcon />
                <AlertTitle>{error.title}</AlertTitle>
                {error.hint && (
                  <AlertDescription>{error.hint}</AlertDescription>
                )}
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(isGenerating || entry) && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 24, scale: 0.98, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 12, scale: 0.98, filter: "blur(6px)" }}
              transition={{ type: "spring", bounce: 0.15, duration: 0.7 }}
            >
              <Card
                aria-busy={isGenerating}
                className="gap-0 rounded-[28px] py-0 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-16px_rgb(0_0_0/0.18)] ring-black/[0.06] dark:ring-white/10"
              >
                <div className="flex min-h-14 items-center justify-between gap-3 px-6 pt-4">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={isGenerating ? "writing" : "done"}
                      {...swap}
                      className={cn(
                        "text-sm font-medium whitespace-nowrap",
                        isGenerating
                          ? "journ-shimmer"
                          : "text-muted-foreground"
                      )}
                    >
                      {isGenerating ? "Writing your entry…" : "Journal entry"}
                    </motion.span>
                  </AnimatePresence>

                  <AnimatePresence>
                    {!isGenerating && entry && (
                      <motion.div
                        key="actions"
                        initial={{ opacity: 0, x: 8, filter: "blur(4px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, x: 8, filter: "blur(4px)" }}
                        transition={{ ...spring, delay: 0.15 }}
                        className="flex items-center gap-1"
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full px-3 text-muted-foreground active:scale-[0.96]"
                          onClick={generate}
                          disabled={!canGenerate}
                        >
                          <RotateCcwIcon data-icon="inline-start" />
                          Regenerate
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 min-w-22 overflow-hidden rounded-full px-3 active:scale-[0.96]"
                          onClick={copy}
                          aria-live="polite"
                        >
                          <AnimatePresence mode="popLayout" initial={false}>
                            <motion.span
                              key={copied ? "copied" : "copy"}
                              initial={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
                              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                              exit={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
                              transition={{ type: "spring", bounce: 0.35, duration: 0.4 }}
                              className="flex items-center gap-1.5"
                            >
                              {copied ? (
                                <CheckIcon className="size-3.5 text-green-600 dark:text-green-500" />
                              ) : (
                                <CopyIcon className="size-3.5" />
                              )}
                              {copied ? "Copied" : "Copy"}
                            </motion.span>
                          </AnimatePresence>
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <AutoHeight>
                  <div className="px-6 pt-3 pb-7">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {entry ? (
                        <motion.div
                          key="entry"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <JournalEntry markdown={entry} />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="skeleton"
                          className="space-y-3.5 py-1"
                          exit={{ opacity: 0, filter: "blur(4px)" }}
                          transition={spring}
                          aria-hidden
                        >
                          <div className="journ-skeleton h-6 w-2/5 rounded-full" />
                          <div className="journ-skeleton h-4 w-full rounded-full" />
                          <div className="journ-skeleton h-4 w-11/12 rounded-full" />
                          <div className="journ-skeleton h-4 w-3/5 rounded-full" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </AutoHeight>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
