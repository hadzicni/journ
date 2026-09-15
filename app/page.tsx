import { JournalGenerator } from "@/components/journal-generator";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 sm:py-20">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Journ
        </h1>
        <p className="text-sm text-muted-foreground">
          Jot down what you did today, however messy. A local model turns it
          into a clean journal entry. Nothing is saved.
        </p>
      </header>
      <JournalGenerator />
    </main>
  );
}
