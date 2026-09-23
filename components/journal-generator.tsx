"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  DicesIcon,
  DownloadIcon,
  LanguagesIcon,
  PencilIcon,
  Redo2Icon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
  Undo2Icon,
} from "lucide-react";

import { EntryDate } from "@/components/entry-date";
import { JournalEntry } from "@/components/journal-entry";
import { Onboarding } from "@/components/onboarding";
import { ModelSelect, useModels } from "@/components/model-select";
import { SegmentedControl } from "@/components/segmented-control";
import { Tilt } from "@/components/tilt";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  entryToMarkdown,
  hasContent,
  parsePartialJson,
  toEntryData,
  type EntryFormat,
  type EntryLength,
} from "@/lib/entry";
import { fromDay, toDay } from "@/lib/day";
import { cn } from "@/lib/utils";

type GenerationError = { title: string; hint?: string };

// A generated entry: the model's raw output, when it was generated, and the
// user's edits to it (null while unedited).
type Version = { output: string; generatedAt: Date; draft: string | null };

const PLACEHOLDER = `standup 9:30, fixed the login redirect bug finally
lunch w/ sara at the thai place
afternoon mostly code review, 3 PRs
felt kinda tired but productive
tmrw: finish the migration script`;

const LENGTH_OPTIONS: { value: EntryLength; label: string }[] = [
  { value: "concise", label: "Concise" },
  { value: "detailed", label: "Detailed" },
];

const FORMAT_OPTIONS: { value: EntryFormat; label: string }[] = [
  { value: "bullets", label: "Bullets" },
  { value: "prose", label: "Prose" },
];

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

// Saves the entry as e.g. "journal-2026-09-23.md", named after its local date.
function downloadMarkdown(markdown: string, date: Date) {
  const url = URL.createObjectURL(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `journal-${toDay(date)}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Apple devices show ⌘ for the shortcut, everything else Ctrl. Unknown until
// hydrated, since the server can't tell.
const subscribeNever = () => () => {};
function useIsApple() {
  return useSyncExternalStore(
    subscribeNever,
    () => {
      const nav = navigator as Navigator & {
        userAgentData?: { platform?: string };
      };
      const platform = nav.userAgentData?.platform || nav.platform || "";
      return /mac|iphone|ipad|ipod/i.test(platform);
    },
    () => null
  );
}

const spring = { type: "spring", bounce: 0, duration: 0.45 } as const;

// Content swaps (button labels, icons) slide and un-blur into place.
const swap = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(4px)" },
  transition: spring,
};

const actionButton =
  "h-8 rounded-full px-3 text-muted-foreground active:scale-[0.96]";

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

export function JournalGenerator({
  defaultModel,
  examples = [],
}: {
  defaultModel?: string;
  examples?: string[];
}) {
  const [notes, setNotes] = useState("");
  const [output, setOutput] = useState("");
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<GenerationError | null>(null);
  const [copied, setCopied] = useState(false);
  // The day the entry is for as "YYYY-MM-DD", or null for the day it's
  // generated on.
  const [entryDay, setEntryDay] = useState<string | null>(null);

  const [length, setLength] = useState<EntryLength>("concise");
  const [format, setFormat] = useState<EntryFormat>("bullets");
  const [matchLanguage, setMatchLanguage] = useState(true);

  const models = useModels();
  const isApple = useIsApple();
  const [pickedModel, setPickedModel] = useState(defaultModel);
  // Without a configured default model, fall back to the first available one.
  const model = pickedModel ?? models.firstModel;

  // The user's edited Markdown; null while the entry is unedited.
  const [draft, setDraft] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  // Words only fly in for freshly generated text, not after editing.
  const [animateWords, setAnimateWords] = useState(true);
  // The entry before the last regenerate, to switch back to. `undone` is
  // true while it's the one shown, so the button offers to redo instead.
  const [previous, setPrevious] = useState<Version | null>(null);
  const [undone, setUndone] = useState(false);

  // Bumped whenever an entry finishes, to replay the shine across it.
  const [finishCount, setFinishCount] = useState(0);

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const lastExample = useRef(-1);
  const abortRef = useRef<AbortController | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(copiedTimer.current);
    },
    []
  );

  // The page background aurora keys off this attribute.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.generating = String(isGenerating);
    return () => {
      delete root.dataset.generating;
    };
  }, [isGenerating]);

  // The page background aurora drifts away from the mouse.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty(
          "--journ-mx",
          String((e.clientX / innerWidth) * 2 - 1)
        );
        root.style.setProperty(
          "--journ-my",
          String((e.clientY / innerHeight) * 2 - 1)
        );
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  // The model streams JSON; render whatever has arrived so far as Markdown.
  const entryDate = entryDay ? fromDay(entryDay) : generatedAt;
  const entry = entryToMarkdown(
    toEntryData(parsePartialJson(output)),
    entryDate
  );
  const finalEntry = draft ?? entry;
  const isEdited = draft !== null && draft !== entry;
  const canGenerate = notes.trim().length > 0 && !isGenerating && !!model;

  async function generate() {
    if (!canGenerate) return;

    // Keep the current entry, so a regenerate can be undone.
    const before: Version | null = finalEntry
      ? { output, generatedAt, draft }
      : null;
    setPrevious(before);
    setUndone(false);
    let received = "";

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setError(null);
    setOutput("");
    setCopied(false);
    setDraft(null);
    setIsEditing(false);
    setAnimateWords(true);
    setGeneratedAt(new Date());

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, model, length, format, matchLanguage }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError({
          title: data.error ?? `Something went wrong (${res.status}).`,
          hint: data.hint,
        });
        models.refresh();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        setOutput(received);
      }

      if (!hasContent(toEntryData(parsePartialJson(received)))) {
        setError({
          title: "The model returned an empty entry.",
          hint: "Try generating again, or add a bit more detail to your notes.",
        });
      } else {
        setFinishCount((count) => count + 1);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setError({
        title: "Generation was interrupted.",
        hint: "The connection to the model dropped before the entry was finished. Check that your provider is still reachable and try again.",
      });
      models.refresh();
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsGenerating(false);
      // A regenerate that produced nothing brings back the entry it replaced.
      if (before && !hasContent(toEntryData(parsePartialJson(received)))) {
        setOutput(before.output);
        setGeneratedAt(before.generatedAt);
        setDraft(before.draft);
        setAnimateWords(false);
        setPrevious(null);
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function startEditing() {
    setDraft(finalEntry);
    setAnimateWords(false);
    setIsEditing(true);
  }

  function finishEditing() {
    setIsEditing(false);
    if (draft === entry) setDraft(null);
  }

  function revertEdits() {
    setDraft(null);
    setIsEditing(false);
  }

  // Swaps the shown entry with the one from before the last regenerate.
  function toggleUndo() {
    if (!previous) return;
    setPrevious({ output, generatedAt, draft });
    setOutput(previous.output);
    setGeneratedAt(previous.generatedAt);
    setDraft(previous.draft);
    setAnimateWords(false);
    setCopied(false);
    setError(null);
    setUndone(!undone);
  }

  // Fills in a random example, never the same one twice in a row.
  function tryExample() {
    if (examples.length === 0) return;
    let next = Math.floor(Math.random() * examples.length);
    if (examples.length > 1 && next === lastExample.current) {
      next = (next + 1) % examples.length;
    }
    lastExample.current = next;
    setNotes(examples[next]);
    notesRef.current?.focus();
  }

  async function copy() {
    setError(null);
    try {
      await writeToClipboard(finalEntry);
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
      <Onboarding
        isApple={isApple}
        onTryExample={examples.length > 0 ? tryExample : undefined}
      />
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
            <Card className="relative gap-0 rounded-[inherit] py-0 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-16px_rgb(0_0_0/0.18)] ring-black/6 transition-shadow duration-300 focus-within:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_48px_-16px_rgb(0_0_0/0.24)] dark:ring-white/10">
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
                  ref={notesRef}
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
                    "max-h-112 min-h-40 resize-none rounded-none border-0 bg-transparent px-6 pt-5 pb-2 text-[1.0625rem] leading-7 shadow-none transition-opacity duration-500 placeholder:text-muted-foreground/60 focus-visible:ring-0 md:text-[1.0625rem] dark:bg-transparent",
                    isGenerating && "opacity-40"
                  )}
                  autoFocus
                />

                <div className="flex flex-wrap items-center gap-2 px-5 pt-1 pb-2">
                  <EntryDate
                    value={entryDay}
                    onChange={setEntryDay}
                    disabled={isGenerating}
                  />
                  <SegmentedControl
                    name="Length"
                    value={length}
                    options={LENGTH_OPTIONS}
                    onChange={setLength}
                    disabled={isGenerating}
                  />
                  <SegmentedControl
                    name="Format"
                    value={format}
                    options={FORMAT_OPTIONS}
                    onChange={setFormat}
                    disabled={isGenerating}
                  />
                  <label
                    className={cn(
                      "flex h-7 cursor-pointer items-center gap-2 rounded-full bg-muted pr-1.5 pl-2.5 text-xs font-medium text-muted-foreground select-none",
                      isGenerating && "pointer-events-none opacity-50"
                    )}
                    title={
                      matchLanguage
                        ? "The entry is written in the language of your notes"
                        : "The entry is written in English"
                    }
                  >
                    <LanguagesIcon className="size-3.5" aria-hidden />
                    Same language as notes
                    <Switch
                      size="sm"
                      checked={matchLanguage}
                      onCheckedChange={setMatchLanguage}
                      disabled={isGenerating}
                    />
                  </label>
                </div>

                <div className="flex items-center gap-3 px-3 pt-1 pb-3 pl-5">
                  <ModelSelect
                    state={models}
                    value={model}
                    onChange={setPickedModel}
                    disabled={isGenerating}
                  />
                  <p
                    className={cn(
                      "hidden items-center gap-1 text-xs text-muted-foreground/80 transition-opacity duration-300 md:flex",
                      isApple === null && "opacity-0"
                    )}
                  >
                    <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans">
                      {isApple === false ? "Ctrl" : "⌘"}
                    </kbd>
                    <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans">
                      ↵
                    </kbd>
                    <span className="ml-1">to generate</span>
                  </p>
                  <div className="ml-auto flex items-center gap-1.5">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {!notes && !isGenerating && examples.length > 0 && (
                        <motion.div
                          key="example"
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
                            onClick={tryExample}
                          >
                            <DicesIcon data-icon="inline-start" />
                            Try an example
                          </Button>
                        </motion.div>
                      )}
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
                      disabled={!isGenerating && !canGenerate}
                      className="relative h-10 min-w-30 overflow-hidden rounded-full px-5 text-[0.9375rem] transition-[scale,opacity,background-color,box-shadow] duration-200 hover:shadow-[0_4px_16px_-4px_rgb(0_0_0/0.3)] active:scale-[0.96] disabled:shadow-none"
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
                className="rounded-2xl border-destructive/20 bg-destructive/6 px-4 py-3"
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
              style={{ transformPerspective: 1200, transformOrigin: "50% 0%" }}
              initial={{
                opacity: 0,
                y: 80,
                rotateX: 35,
                scale: 0.85,
                filter: "blur(20px)",
              }}
              animate={{
                opacity: 1,
                y: 0,
                rotateX: 0,
                scale: 1,
                filter: "blur(0px)",
              }}
              exit={{
                opacity: 0,
                y: 40,
                rotateX: -20,
                scale: 0.9,
                filter: "blur(12px)",
              }}
              transition={{ type: "spring", bounce: 0.35, duration: 0.9 }}
            >
              <Tilt disabled={isEditing} className="rounded-[28px]">
                <Card
                  aria-busy={isGenerating}
                  className="relative gap-0 rounded-[28px] py-0 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-16px_rgb(0_0_0/0.18)] ring-black/6 dark:ring-white/10"
                >
                  <div className="flex min-h-14 items-center justify-between gap-3 px-6 pt-4">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={
                          isGenerating
                            ? "writing"
                            : isEdited
                              ? "edited"
                              : "done"
                        }
                        {...swap}
                        className={cn(
                          "text-sm font-medium whitespace-nowrap",
                          isGenerating
                            ? "journ-shimmer"
                            : "text-muted-foreground"
                        )}
                      >
                        {isGenerating
                          ? "Writing your entry…"
                          : isEdited
                            ? "Journal entry · Edited"
                            : "Journal entry"}
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
                          {isEditing ? (
                            <>
                              {isEdited && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={actionButton}
                                  onClick={revertEdits}
                                  aria-label="Revert edits"
                                >
                                  <Undo2Icon data-icon="inline-start" />
                                  <span className="hidden sm:inline">
                                    Revert
                                  </span>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className={actionButton}
                                onClick={finishEditing}
                                aria-label="Done editing"
                              >
                                <CheckIcon data-icon="inline-start" />
                                <span className="hidden sm:inline">Done</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={actionButton}
                                onClick={startEditing}
                                aria-label="Edit entry"
                              >
                                <PencilIcon data-icon="inline-start" />
                                <span className="hidden sm:inline">Edit</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={actionButton}
                                onClick={generate}
                                disabled={!canGenerate}
                                aria-label="Regenerate entry"
                              >
                                <RotateCcwIcon data-icon="inline-start" />
                                <span className="hidden sm:inline">
                                  Regenerate
                                </span>
                              </Button>
                              {previous && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={actionButton}
                                  onClick={toggleUndo}
                                  aria-label={
                                    undone
                                      ? "Redo regenerate"
                                      : "Undo regenerate"
                                  }
                                  title={
                                    undone
                                      ? "Back to the regenerated entry"
                                      : "Back to the previous entry"
                                  }
                                >
                                  {undone ? (
                                    <Redo2Icon data-icon="inline-start" />
                                  ) : (
                                    <Undo2Icon data-icon="inline-start" />
                                  )}
                                  <span className="hidden sm:inline">
                                    {undone ? "Redo" : "Undo"}
                                  </span>
                                </Button>
                              )}
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className={actionButton}
                            onClick={() =>
                              downloadMarkdown(finalEntry, entryDate)
                            }
                            aria-label="Download entry as Markdown"
                            title="Download as Markdown (.md)"
                          >
                            <DownloadIcon data-icon="inline-start" />
                            <span className="hidden sm:inline">Download</span>
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
                                initial={{
                                  opacity: 0,
                                  scale: 0.6,
                                  filter: "blur(4px)",
                                }}
                                animate={{
                                  opacity: 1,
                                  scale: 1,
                                  filter: "blur(0px)",
                                }}
                                exit={{
                                  opacity: 0,
                                  scale: 0.6,
                                  filter: "blur(4px)",
                                }}
                                transition={{
                                  type: "spring",
                                  bounce: 0.35,
                                  duration: 0.4,
                                }}
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
                        {isEditing ? (
                          <motion.div
                            key="editor"
                            initial={{ opacity: 0, filter: "blur(4px)" }}
                            animate={{ opacity: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, filter: "blur(4px)" }}
                            transition={spring}
                          >
                            <label htmlFor="entry-editor" className="sr-only">
                              Edit journal entry (Markdown)
                            </label>
                            <Textarea
                              id="entry-editor"
                              value={draft ?? ""}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") finishEditing();
                              }}
                              autoFocus
                              className="min-h-40 resize-none rounded-2xl border-0 bg-muted/60 p-4 font-mono text-[0.8125rem] leading-6 focus-visible:ring-2 md:text-[0.8125rem] dark:bg-muted/40"
                            />
                          </motion.div>
                        ) : finalEntry ? (
                          <motion.div
                            key="entry"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            <JournalEntry
                              markdown={finalEntry}
                              streaming={isGenerating}
                              animate={animateWords}
                            />
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
                {finishCount > 0 && (
                  <div key={finishCount} className="journ-shine" aria-hidden />
                )}
              </Tilt>
              <p className="mt-3 px-6 text-center text-xs text-muted-foreground/80">
                AI can make mistakes. Check the entry against your notes before
                you keep it.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
