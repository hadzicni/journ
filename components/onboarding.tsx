"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRightIcon,
  CalendarIcon,
  CpuIcon,
  DicesIcon,
  LanguagesIcon,
  LockIcon,
  PenLineIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Remembers in this browser that the onboarding was seen. Only this flag is
// stored, never notes or entries.
const STORAGE_KEY = "journ:onboarded";

const subscribeNever = () => () => {};

function readSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Storage is blocked (e.g. private mode); don't nag on every visit.
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {}
}

const spring = { type: "spring", bounce: 0, duration: 0.5 } as const;

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-14 items-center justify-center rounded-2xl bg-[conic-gradient(from_200deg,#0a84ff,#5e5ce6,#bf5af2,#ff375f,#ff9f0a,#0a84ff)] text-white shadow-[0_8px_24px_-6px_rgb(191_90_242/0.6)] [&_svg]:size-7">
      {children}
    </div>
  );
}

// A tiny before/after: messy notes turning into a clean entry.
function NotesDemo() {
  return (
    <div className="grid gap-2 text-[0.8125rem] leading-6">
      <div className="rounded-2xl bg-muted px-4 py-3 font-mono text-[0.75rem] text-muted-foreground">
        lunch w/ sara @ thai place
        <br />
        fixed login bug finaly
        <br />
        tmrw: finish migration
      </div>
      <div className="flex justify-center text-muted-foreground/60">
        <ArrowRightIcon className="size-4 rotate-90" aria-hidden />
      </div>
      <div className="rounded-2xl px-4 py-3 ring-1 ring-foreground/10">
        <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground">
          What I did
        </p>
        <p>Had lunch with Sara at the Thai place.</p>
        <p>Finally fixed the login bug.</p>
        <p className="mt-1.5 text-[0.7rem] font-semibold tracking-wide text-muted-foreground">
          Plans
        </p>
        <p>Finish the migration.</p>
      </div>
    </div>
  );
}

function OptionChips({ isApple }: { isApple: boolean | null }) {
  const chips: { icon: ReactNode; label: string }[] = [
    { icon: <SlidersHorizontalIcon />, label: "Concise or detailed" },
    { icon: <PenLineIcon />, label: "Bullets or prose" },
    { icon: <CalendarIcon />, label: "Any day" },
    { icon: <LanguagesIcon />, label: "Your language" },
    { icon: <CpuIcon />, label: "Local or cloud model" },
  ];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5"
          >
            {chip.icon}
            {chip.label}
          </span>
        ))}
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans">
          {isApple === false ? "Ctrl" : "⌘"}
        </kbd>
        <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans">↵</kbd>
        <span className="ml-1">generates your entry</span>
      </p>
    </div>
  );
}

type Step = {
  icon: ReactNode;
  title: string;
  description: string;
  extra?: ReactNode;
};

// A short walkthrough shown on the first visit.
export function Onboarding({
  isApple,
  onTryExample,
}: {
  isApple: boolean | null;
  onTryExample?: () => void;
}) {
  // Assume "seen" on the server, so the dialog only ever opens after hydration.
  const seen = useSyncExternalStore(subscribeNever, readSeen, () => true);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const steps: Step[] = [
    {
      icon: <SparklesIcon />,
      title: "Welcome to Journ",
      description:
        "Turn the rough notes you jot down about your day into a clean, readable journal entry.",
    },
    {
      icon: <PenLineIcon />,
      title: "Write it however you like",
      description:
        "Shorthand, typos, half sentences, any language. Journ fixes the wording and sorts it into sections, but keeps every detail and never makes things up.",
      extra: <NotesDemo />,
    },
    {
      icon: <SlidersHorizontalIcon />,
      title: "Make it yours",
      description:
        "Choose the length and format, the day the entry is for, and the model that writes it.",
      extra: <OptionChips isApple={isApple} />,
    },
    {
      icon: <LockIcon />,
      title: "Private by design",
      description:
        "Your notes and entries are never saved. With a local model through Ollama, they don't even leave your computer. AI can make mistakes, so give each entry a quick read.",
      extra: onTryExample && (
        <Button
          variant="secondary"
          className="h-10 self-start rounded-full px-4"
          onClick={() => {
            finish();
            onTryExample();
          }}
        >
          <DicesIcon data-icon="inline-start" />
          Start with an example
        </Button>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  function finish() {
    markSeen();
    setDismissed(true);
  }

  function go(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  return (
    <Dialog
      open={!seen && !dismissed}
      onOpenChange={(open) => {
        if (!open) finish();
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-generating="true"
        className="gap-0 rounded-[28px] bg-transparent p-0 ring-0 sm:max-w-md"
      >
        <div className="journ-glow" data-blur aria-hidden />
        <div className="journ-glow" aria-hidden />
        <div className="relative flex flex-col overflow-hidden rounded-[inherit] bg-popover ring-1 ring-black/6 dark:ring-white/10">
          <div className="relative min-h-104 px-7 pt-8">
            <AnimatePresence
              mode="popLayout"
              initial={false}
              custom={direction}
            >
              <motion.div
                key={step}
                custom={direction}
                variants={{
                  enter: (d: number) => ({
                    opacity: 0,
                    x: 48 * d,
                    filter: "blur(8px)",
                  }),
                  center: { opacity: 1, x: 0, filter: "blur(0px)" },
                  exit: (d: number) => ({
                    opacity: 0,
                    x: -48 * d,
                    filter: "blur(8px)",
                  }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={spring}
                className="flex flex-col gap-5"
              >
                <motion.div
                  initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{
                    type: "spring",
                    bounce: 0.45,
                    duration: 0.7,
                    delay: 0.05,
                  }}
                  className="self-start"
                >
                  <IconBadge>{current.icon}</IconBadge>
                </motion.div>
                <div className="flex flex-col gap-2">
                  <DialogTitle className="font-heading text-2xl font-bold tracking-tight">
                    {current.title}
                  </DialogTitle>
                  <DialogDescription className="text-[0.9375rem] leading-relaxed text-pretty">
                    {current.description}
                  </DialogDescription>
                </div>
                {current.extra}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3 px-5 pt-4 pb-5">
            <div className="flex gap-1.5 pl-2" aria-hidden>
              {steps.map((_, i) => (
                <motion.span
                  key={i}
                  animate={{ width: i === step ? 20 : 6 }}
                  transition={spring}
                  className={cn(
                    "h-1.5 rounded-full transition-colors duration-300",
                    i === step ? "bg-foreground" : "bg-foreground/15"
                  )}
                />
              ))}
            </div>
            <span className="sr-only">
              Step {step + 1} of {steps.length}
            </span>

            <div className="ml-auto flex items-center gap-1.5">
              {step === 0 ? (
                <Button
                  variant="ghost"
                  className="h-10 rounded-full px-4 text-muted-foreground"
                  onClick={finish}
                >
                  Skip
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="h-10 rounded-full px-4 text-muted-foreground"
                  onClick={() => go(step - 1)}
                >
                  Back
                </Button>
              )}
              <Button
                className="h-10 min-w-24 rounded-full px-5 active:scale-[0.96]"
                onClick={() => (isLast ? finish() : go(step + 1))}
                autoFocus
              >
                {isLast ? "Get started" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
