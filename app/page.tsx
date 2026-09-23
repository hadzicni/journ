import { connection } from "next/server";

import { JournalGenerator } from "@/components/journal-generator";
import { ThemeToggle } from "@/components/theme-toggle";
import { TodayLabel } from "@/components/today-label";
import { loadExamples } from "@/lib/examples";
import { defaultModelId } from "@/lib/providers";

export default async function Home() {
  // Render per request so the default model matches the current env config.
  await connection();
  const model = defaultModelId();
  const examples = await loadExamples();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-14 sm:py-24">
      <div className="journ-aurora" aria-hidden>
        <div>
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="journ-edge" aria-hidden />
      <header className="flex flex-col gap-2 px-2 animate-in duration-700 fill-mode-both fade-in blur-in slide-in-from-bottom-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.8rem] font-semibold tracking-wide text-muted-foreground uppercase">
            <TodayLabel />
          </p>
          <ThemeToggle />
        </div>
        <h1 className="font-heading text-5xl font-bold tracking-tight">
          Journ
        </h1>
        <p className="max-w-md text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground">
          Jot down what you did today, however messy. A local or cloud model
          turns it into a clean journal entry. Nothing is saved.
        </p>
      </header>
      <JournalGenerator defaultModel={model} examples={examples} />
    </main>
  );
}
