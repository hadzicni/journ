"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  HeartIcon,
  Maximize2Icon,
  Minimize2Icon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  REWRITE_ACTIONS,
  REWRITE_LABELS,
  type RewriteAction,
} from "@/lib/rewrite";
import { cn } from "@/lib/utils";

const ICONS: Record<RewriteAction, ReactNode> = {
  rephrase: <WandSparklesIcon />,
  shorter: <Minimize2Icon />,
  longer: <Maximize2Icon />,
  warmer: <HeartIcon />,
};

// A selected passage of the entry, located in its Markdown source.
type Target = {
  text: string;
  start: number;
  end: number;
  // Bullet points must stay on one line.
  singleLine: boolean;
  // The selection's position in page coordinates.
  top: number;
  bottom: number;
  centerX: number;
};

type Phase = "tools" | "running" | "done" | "error";

const spring = { type: "spring", bounce: 0.2, duration: 0.4 } as const;

// Finds a rendered block's text in the Markdown: a whole line, optionally
// after a list or quote marker.
function findBlock(markdown: string, text: string) {
  for (
    let i = markdown.indexOf(text);
    i >= 0;
    i = markdown.indexOf(text, i + 1)
  ) {
    const lineStart = markdown.lastIndexOf("\n", i - 1) + 1;
    const prefix = markdown.slice(lineStart, i);
    const next = markdown[i + text.length];
    if (/^(?:[-*] |> )?$/.test(prefix) && (next === undefined || next === "\n"))
      return i;
  }
  return -1;
}

// Maps the current selection to the Markdown. Only selections within one
// paragraph or bullet are supported, so the entry's structure stays intact.
function readSelection(
  container: HTMLElement,
  markdown: string
): Target | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0).cloneRange();
  if (!container.contains(range.commonAncestorContainer)) return null;

  const blockOf = (node: Node) =>
    (node instanceof Element ? node : node.parentElement)?.closest("li, p");
  const block = blockOf(range.startContainer);
  if (!block || !container.contains(block)) return null;
  // A triple click ends the selection at the start of the next block.
  if (!block.contains(range.endContainer)) {
    const selected = range.toString().trim();
    range.setEnd(block, block.childNodes.length);
    if (range.toString().trim() !== selected) return null;
  }

  const blockText = block.textContent ?? "";
  const before = document.createRange();
  before.setStart(block, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const raw = range.toString();
  const text = raw.trim();
  const offset =
    before.toString().length + (raw.length - raw.trimStart().length);
  if (!text || blockText.slice(offset, offset + text.length) !== text) {
    return null;
  }

  const blockStart = findBlock(markdown, blockText);
  if (blockStart < 0) return null;

  const rect = range.getBoundingClientRect();
  return {
    text,
    start: blockStart + offset,
    end: blockStart + offset + text.length,
    singleLine: block.tagName === "LI",
    top: rect.top + window.scrollY,
    bottom: rect.bottom + window.scrollY,
    centerX: rect.left + rect.width / 2 + window.scrollX,
  };
}

// Keeps a floating element of the given width inside the viewport.
function clampCenter(x: number, width: number) {
  const half = Math.min(width, window.innerWidth - 32) / 2;
  return Math.min(
    Math.max(x, window.scrollX + 16 + half),
    window.scrollX + window.innerWidth - 16 - half
  );
}

// Apple-style Writing Tools: select part of the entry to rephrase, shorten,
// expand, or warm it up. The rewrite streams into a panel and only replaces
// the selection once accepted.
export function WritingTools({
  markdown,
  notes,
  model,
  disabled,
  onReplace,
  children,
}: {
  markdown: string;
  notes: string;
  model?: string;
  disabled: boolean;
  onReplace: (markdown: string) => void;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [target, setTarget] = useState<Target | null>(null);
  const [phase, setPhase] = useState<Phase>("tools");
  const [action, setAction] = useState<RewriteAction>("rephrase");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  // Kept in refs so the listeners below always see the latest values.
  const latest = useRef({ markdown, phase });
  useEffect(() => {
    latest.current = { markdown, phase };
  }, [markdown, phase]);

  function close() {
    abortRef.current?.abort();
    abortRef.current = null;
    setTarget(null);
    setPhase("tools");
    setResult("");
    setError("");
  }
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // Follow the selection while the toolbar is showing; once a rewrite has
  // started, the panel stays until it's closed.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onSelectionChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const container = containerRef.current;
        if (!container || latest.current.phase !== "tools") return;
        setTarget(readSelection(container, latest.current.markdown));
      }, 120);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (latest.current.phase === "tools") return;
      if (floatingRef.current?.contains(e.target as Node)) return;
      closeRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      abortRef.current?.abort();
    };
  }, []);

  async function run(next: RewriteAction) {
    if (!target) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAction(next);
    setPhase("running");
    setResult("");
    setError("");

    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: next,
          passage: target.text,
          singleLine: target.singleLine,
          entry: markdown,
          notes,
          model,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Something went wrong (${res.status}).`);
        setPhase("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let received = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        setResult(received);
      }
      if (!received.trim()) {
        setError("The model returned nothing. Try again.");
        setPhase("error");
        return;
      }
      setPhase("done");
    } catch {
      if (controller.signal.aborted) return;
      setError("The connection to the model dropped. Try again.");
      setPhase("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setPhase(result.trim() ? "done" : "tools");
  }

  function replace() {
    if (!target) return;
    let text = result.trim().replace(/^["“]([\s\S]*)["”]$/, "$1");
    if (target.singleLine) text = text.replace(/\s*\n\s*/g, " ");
    // The entry may have changed underneath, e.g. by a regenerate.
    if (markdown.slice(target.start, target.end) !== target.text) {
      setError("The entry changed in the meantime. Select the text again.");
      setPhase("error");
      return;
    }
    onReplace(
      markdown.slice(0, target.start) + text + markdown.slice(target.end)
    );
    window.getSelection()?.removeAllRanges();
    close();
  }

  const visible = !!target && !disabled;
  const isPanel = phase !== "tools";
  const panelWidth = 384;
  const words = result.trim() ? result.trim().split(/(\s+)/) : [];

  return (
    <div ref={containerRef}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {visible && (
              <motion.div
                key={isPanel ? "panel" : "tools"}
                ref={floatingRef}
                initial={{ opacity: 0, y: isPanel ? -6 : 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={spring}
                // Keep the selection when clicking the toolbar.
                onMouseDown={(e) => {
                  if (!isPanel) e.preventDefault();
                }}
                className="absolute z-30 -translate-x-1/2"
                style={
                  isPanel
                    ? {
                        top: target.bottom + 10,
                        left: clampCenter(target.centerX, panelWidth),
                        width: `min(${panelWidth}px, calc(100vw - 2rem))`,
                      }
                    : {
                        top: target.top - 52,
                        left: clampCenter(target.centerX, 360),
                      }
                }
              >
                {isPanel ? (
                  <div
                    className="relative rounded-[22px]"
                    data-generating={phase === "running"}
                  >
                    <div className="journ-glow" data-blur aria-hidden />
                    <div className="journ-glow" aria-hidden />
                    <div
                      className="relative flex flex-col gap-3 rounded-[inherit] bg-popover p-4 shadow-[0_16px_48px_-16px_rgb(0_0_0/0.35)] ring-1 ring-black/6 dark:ring-white/10"
                      role="dialog"
                      aria-label={`Writing Tools: ${REWRITE_LABELS[action]}`}
                    >
                      <div className="flex items-center gap-2">
                        <SparklesIcon
                          className="size-3.5"
                          style={{ stroke: "url(#journ-tools-gradient)" }}
                        />
                        <span className="text-xs font-medium text-muted-foreground">
                          {REWRITE_LABELS[action]}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="ml-auto rounded-full text-muted-foreground"
                          onClick={close}
                          aria-label="Close Writing Tools"
                        >
                          <XIcon />
                        </Button>
                      </div>

                      {phase === "error" ? (
                        <p className="text-sm text-destructive">{error}</p>
                      ) : words.length > 0 ? (
                        <p
                          className="max-h-60 overflow-y-auto text-[0.9375rem] leading-7"
                          aria-live="polite"
                        >
                          {words.map((part, i) =>
                            /^\s+$/.test(part) ? (
                              part
                            ) : (
                              <span key={i} className="journ-word">
                                {part}
                              </span>
                            )
                          )}
                        </p>
                      ) : (
                        <p className="journ-shimmer text-sm font-medium">
                          Rewriting…
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-1.5">
                        {phase === "running" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full px-3 text-muted-foreground"
                            onClick={stop}
                          >
                            <SquareIcon
                              data-icon="inline-start"
                              className="size-3 fill-current"
                            />
                            Stop
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-full px-3 text-muted-foreground"
                              onClick={() => run(action)}
                            >
                              <RotateCcwIcon data-icon="inline-start" />
                              Try again
                            </Button>
                            {phase === "done" && (
                              <Button
                                size="sm"
                                className="h-8 rounded-full px-4"
                                onClick={replace}
                                autoFocus
                              >
                                Replace
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    role="toolbar"
                    aria-label="Writing Tools"
                    className="flex items-center gap-0.5 rounded-full bg-popover/85 p-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/6 backdrop-blur-xl dark:ring-white/10"
                  >
                    <span className="flex size-8 items-center justify-center">
                      <SparklesIcon
                        className="size-4"
                        style={{ stroke: "url(#journ-tools-gradient)" }}
                        aria-hidden
                      />
                    </span>
                    {REWRITE_ACTIONS.map((next) => (
                      <Button
                        key={next}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 rounded-full px-3 text-[0.8125rem] text-foreground/80"
                        )}
                        onClick={() => run(next)}
                      >
                        {ICONS[next]}
                        {REWRITE_LABELS[next]}
                      </Button>
                    ))}
                  </div>
                )}
                <svg width="0" height="0" className="absolute" aria-hidden>
                  <defs>
                    <linearGradient
                      id="journ-tools-gradient"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#0a84ff" />
                      <stop offset="45%" stopColor="#bf5af2" />
                      <stop offset="100%" stopColor="#ff375f" />
                    </linearGradient>
                  </defs>
                </svg>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
