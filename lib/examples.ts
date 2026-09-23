import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const EXAMPLES_DIR = path.join(process.cwd(), "examples");

// Edge-case tests that make poor demos (see examples/README.md).
const EDGE_CASES = new Set([
  "06-no-invention-trap.txt",
  "07-unrelated-items.txt",
  "11-minimal.txt",
  "14-injection-attempt.txt",
]);

// The example notes behind "Try an example". Missing files just mean no
// examples, so the button hides instead of breaking the page.
export async function loadExamples(): Promise<string[]> {
  try {
    const files = (await readdir(EXAMPLES_DIR))
      .filter((file) => file.endsWith(".txt") && !EDGE_CASES.has(file))
      .sort();
    const notes = await Promise.all(
      files.map((file) => readFile(path.join(EXAMPLES_DIR, file), "utf8"))
    );
    return notes.map((note) => note.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
