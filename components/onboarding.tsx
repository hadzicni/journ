"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckIcon,
  ChevronLeftIcon,
  CircleHelpIcon,
  CpuIcon,
  DicesIcon,
  LockIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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

// Lets the help button in the header reopen the onboarding, which lives in
// the generator.
const reopenListeners = new Set<() => void>();

export function OnboardingButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-7 rounded-full bg-muted text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
      onClick={() => reopenListeners.forEach((listener) => listener())}
      aria-label="How Journ works"
      title="How Journ works"
    >
      <CircleHelpIcon className="size-3.5" />
    </Button>
  );
}

const spring = { type: "spring", bounce: 0, duration: 0.55 } as const;

const glass =
  "bg-white/80 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)] ring-1 ring-black/5 backdrop-blur-xl dark:bg-white/10 dark:shadow-[0_12px_32px_-12px_rgb(0_0_0/0.6)] dark:ring-white/10";

// Soft color washes behind each step's illustration, in the app's palette.
const HERO_BACKGROUNDS = [
  "radial-gradient(at 18% 22%, rgb(10 132 255 / 0.32), transparent 55%), radial-gradient(at 82% 28%, rgb(191 90 242 / 0.3), transparent 55%), radial-gradient(at 50% 110%, rgb(255 55 95 / 0.22), transparent 60%)",
  "radial-gradient(at 15% 30%, rgb(191 90 242 / 0.3), transparent 55%), radial-gradient(at 85% 20%, rgb(255 55 95 / 0.25), transparent 55%), radial-gradient(at 50% 110%, rgb(10 132 255 / 0.22), transparent 60%)",
  "radial-gradient(at 20% 25%, rgb(255 159 10 / 0.28), transparent 55%), radial-gradient(at 80% 30%, rgb(255 55 95 / 0.25), transparent 55%), radial-gradient(at 50% 110%, rgb(191 90 242 / 0.22), transparent 60%)",
  "radial-gradient(at 20% 25%, rgb(10 132 255 / 0.3), transparent 55%), radial-gradient(at 80% 25%, rgb(100 210 255 / 0.28), transparent 55%), radial-gradient(at 50% 110%, rgb(94 92 230 / 0.22), transparent 60%)",
];

// Gently bobs its children up and down.
function Float({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{
        duration: 5,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Icons stroked with the app's rainbow gradient (see <IconGradient />).
const gradientStroke = { stroke: "url(#journ-icon-gradient)" };

function IconGradient() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="journ-icon-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0a84ff" />
          <stop offset="45%" stopColor="#bf5af2" />
          <stop offset="100%" stopColor="#ff375f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex size-20 items-center justify-center rounded-[24px] [&_svg]:size-9",
        glass
      )}
    >
      {children}
    </div>
  );
}

function Pill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full px-3 text-[0.72rem] font-medium whitespace-nowrap text-foreground/80 [&_svg]:size-3.5",
        glass,
        className
      )}
    >
      {children}
    </span>
  );
}

function WelcomeArt() {
  return (
    <Float>
      <IconTile>
        <SparklesIcon style={gradientStroke} strokeWidth={1.75} />
      </IconTile>
    </Float>
  );
}

// Messy notes on a card, with the clean entry laid over them.
function NotesArt() {
  return (
    <div className="relative h-36 w-64">
      <Float className="absolute top-1 left-0" delay={0.4}>
        <div
          className={cn(
            "w-40 -rotate-6 rounded-2xl px-3.5 py-3 font-mono text-[0.62rem] leading-[1.15rem] text-muted-foreground",
            glass
          )}
        >
          lunch w/ sara @ thai
          <br />
          fixed login bug finaly
          <br />
          tmrw: migration
        </div>
      </Float>
      <motion.div
        initial={{ opacity: 0, x: 24, rotate: 10 }}
        animate={{ opacity: 1, x: 0, rotate: 3 }}
        transition={{ ...spring, delay: 0.25 }}
        className="absolute right-0 bottom-0"
      >
        <Float>
          <div
            className={cn(
              "w-44 rounded-2xl px-3.5 py-3 text-[0.66rem] leading-[1.1rem]",
              glass
            )}
          >
            <p className="text-[0.55rem] font-semibold tracking-wide text-muted-foreground uppercase">
              What I did
            </p>
            <p>Had lunch with Sara.</p>
            <p>Finally fixed the login bug.</p>
            <p className="mt-1 text-[0.55rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Plans
            </p>
            <p>Finish the migration.</p>
          </div>
        </Float>
      </motion.div>
    </div>
  );
}

// The composer's options, floating as a loose cluster.
function OptionsArt() {
  return (
    <div className="flex max-w-72 flex-wrap items-center justify-center gap-2">
      <Float delay={0}>
        <span
          className={cn(
            "flex h-7 items-center rounded-full p-0.5 text-[0.72rem] font-medium",
            glass
          )}
        >
          <span className="rounded-full bg-foreground px-2.5 py-1 text-background">
            Concise
          </span>
          <span className="px-2.5 text-muted-foreground">Detailed</span>
        </span>
      </Float>
      <Float delay={0.8}>
        <Pill>Bullets · Prose</Pill>
      </Float>
      <Float delay={1.6}>
        <Pill>Yesterday</Pill>
      </Float>
      <Float delay={0.4}>
        <Pill>
          <span className="size-1.5 rounded-full bg-green-500" />
          llama3.2
        </Pill>
      </Float>
      <Float delay={1.2}>
        <Pill>Deutsch · English · Français</Pill>
      </Float>
    </div>
  );
}

function PrivacyArt() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Float>
        <IconTile>
          <LockIcon style={gradientStroke} strokeWidth={1.75} />
        </IconTile>
      </Float>
      <div className="flex gap-2">
        <Float delay={0.6}>
          <Pill>
            <CheckIcon className="text-green-600 dark:text-green-500" />
            Nothing saved
          </Pill>
        </Float>
        <Float delay={1.2}>
          <Pill>
            <CpuIcon className="text-muted-foreground" />
            Runs locally
          </Pill>
        </Float>
      </div>
    </div>
  );
}

type Step = { art: ReactNode; title: string; description: ReactNode };

// A short walkthrough shown on the first visit, and from the help button.
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
  const [reopened, setReopened] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const reopen = () => {
      setStep(0);
      setDirection(1);
      setReopened(true);
    };
    reopenListeners.add(reopen);
    return () => {
      reopenListeners.delete(reopen);
    };
  }, []);

  const shortcut = (
    <span className="inline-flex translate-y-[-1px] gap-0.5 align-middle">
      <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans text-xs text-foreground/80">
        {isApple === false ? "Ctrl" : "⌘"}
      </kbd>
      <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans text-xs text-foreground/80">
        ↵
      </kbd>
    </span>
  );

  const steps: Step[] = [
    {
      art: <WelcomeArt />,
      title: "Welcome to Journ",
      description:
        "Turn the messy notes you jot down about your day into a clean journal entry.",
    },
    {
      art: <NotesArt />,
      title: "Write however you like",
      description:
        "Shorthand, typos, any language. Journ tidies it up and sorts it into sections, without inventing anything.",
    },
    {
      art: <OptionsArt />,
      title: "Make it yours",
      description: (
        <>
          Pick the length, format and day, and a local or cloud model. Then
          press {shortcut} to generate.
        </>
      ),
    },
    {
      art: <PrivacyArt />,
      title: "Private by design",
      description:
        "Nothing is ever saved. With Ollama, your notes never leave your computer. AI can make mistakes, so give each entry a quick read.",
    },
  ];

  const isLast = step === steps.length - 1;

  function finish() {
    markSeen();
    setDismissed(true);
    setReopened(false);
  }

  function go(next: number) {
    if (next < 0 || next >= steps.length) return;
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  return (
    <Dialog
      open={reopened || (!seen && !dismissed)}
      onOpenChange={(open) => {
        if (!open) finish();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(step + 1);
          if (e.key === "ArrowLeft") go(step - 1);
        }}
        className="gap-0 overflow-hidden rounded-[32px] bg-popover p-0 shadow-[0_24px_80px_-20px_rgb(0_0_0/0.45)] ring-black/6 duration-300 sm:max-w-[420px] data-open:slide-in-from-bottom-4 dark:ring-white/10"
      >
        <IconGradient />

        {/* Illustration */}
        <div className="relative flex h-60 items-center justify-center overflow-hidden bg-muted/50 dark:bg-muted/30">
          <AnimatePresence initial={false}>
            <motion.div
              key={step}
              className="absolute inset-0"
              style={{ background: HERO_BACKGROUNDS[step] }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              aria-hidden
            />
          </AnimatePresence>
          <div
            className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-b from-transparent to-popover"
            aria-hidden
          />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={step}
              className="relative"
              initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
              transition={spring}
              aria-hidden
            >
              {steps[step].art}
            </motion.div>
          </AnimatePresence>

          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-4 right-4 rounded-full bg-background/50 text-muted-foreground backdrop-blur-md hover:bg-background/80 hover:text-foreground"
              />
            }
            aria-label="Close"
          >
            <XIcon />
          </DialogClose>
        </div>

        {/* Text */}
        <div className="relative min-h-36 px-8 pt-2 text-center">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: 24 * d }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: -24 * d }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring}
              className="flex flex-col gap-2.5"
            >
              <DialogTitle className="font-heading text-[1.625rem] leading-tight font-semibold tracking-tight">
                {steps[step].title}
              </DialogTitle>
              <DialogDescription className="text-[0.9375rem] leading-relaxed text-pretty">
                {steps[step].description}
              </DialogDescription>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-5 px-6 pt-4 pb-6">
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <motion.button
                key={i}
                type="button"
                tabIndex={-1}
                onClick={() => go(i)}
                animate={{ width: i === step ? 18 : 6 }}
                transition={spring}
                className={cn(
                  "h-1.5 cursor-pointer rounded-full transition-colors duration-300",
                  i === step
                    ? "bg-foreground"
                    : "bg-foreground/15 hover:bg-foreground/30"
                )}
              />
            ))}
          </div>
          <span className="sr-only" aria-live="polite">
            Step {step + 1} of {steps.length}
          </span>

          <div className="flex w-full items-center gap-2">
            <AnimatePresence initial={false}>
              {step > 0 && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={spring}
                  className="shrink-0 overflow-hidden"
                >
                  <Button
                    variant="secondary"
                    size="icon-lg"
                    className="size-11 rounded-full"
                    onClick={() => go(step - 1)}
                    aria-label="Back"
                  >
                    <ChevronLeftIcon />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            {isLast && onTryExample && (
              <Button
                variant="secondary"
                className="h-11 flex-1 rounded-full text-[0.9375rem]"
                onClick={() => {
                  finish();
                  onTryExample();
                }}
              >
                <DicesIcon data-icon="inline-start" />
                <span className="sm:hidden">Example</span>
                <span className="hidden sm:inline">Try an example</span>
              </Button>
            )}
            <Button
              className="h-11 flex-1 rounded-full text-[0.9375rem] active:scale-[0.98]"
              onClick={() => (isLast ? finish() : go(step + 1))}
              autoFocus
            >
              {isLast ? "Get started" : "Continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
