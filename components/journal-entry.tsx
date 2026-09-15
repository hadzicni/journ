import Markdown, { type Components } from "react-markdown";

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

// Wraps every word in its own span. React keeps already-rendered spans
// mounted while the text streams in, so only newly arrived words play the
// fade-in animation.
function rehypeWords() {
  const wrap = (node: HastNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type !== "text" || !child.value) {
        wrap(child);
        return [child];
      }
      return child.value
        .split(/(\s+)/)
        .filter(Boolean)
        .map((part) =>
          /^\s+$/.test(part)
            ? { type: "text", value: part }
            : {
                type: "element",
                tagName: "span",
                properties: { className: ["journ-word"] },
                children: [{ type: "text", value: part }],
              }
        );
    });
  };
  return wrap;
}

const rehypePlugins = [rehypeWords];

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-5 font-heading text-2xl font-semibold tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-7 mb-2 text-[0.8rem] font-semibold tracking-wide text-muted-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-2 font-semibold">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 leading-7 text-pretty last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 leading-7 marker:text-muted-foreground/60 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 leading-7 marker:text-muted-foreground/60 last:mb-0">
      {children}
    </ol>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  hr: () => <hr className="my-5" />,
};

export function JournalEntry({ markdown }: { markdown: string }) {
  return (
    <div className="text-[0.975rem] text-card-foreground">
      <Markdown components={components} rehypePlugins={rehypePlugins}>
        {markdown}
      </Markdown>
    </div>
  );
}
