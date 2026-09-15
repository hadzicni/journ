import { JournalGenerator } from "@/components/journal-generator";
import { TodayLabel } from "@/components/today-label";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-14 sm:py-24">
      <header className="flex flex-col gap-2 px-2 animate-in duration-700 fill-mode-both fade-in blur-in slide-in-from-bottom-3">
        <p className="text-[0.8rem] font-semibold tracking-wide text-muted-foreground uppercase">
          <TodayLabel />
        </p>
        <h1 className="font-heading text-5xl font-bold tracking-tight">
          Journ
        </h1>
        <p className="max-w-md text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground">
          Jot down what you did today, however messy. A local model turns it
          into a clean journal entry. Nothing is saved.
        </p>
      </header>
      <JournalGenerator />
    </main>
  );
}
