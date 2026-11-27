// Minimal, safe Markdown renderer for Atlas replies. The system prompt asks
// for Markdown, but chat bubbles previously showed literal ** and ###. Only
// a small inline/block subset is turned into React elements — no raw HTML is
// ever injected, so model output can't introduce scripts or event handlers.
import { Fragment, type ReactNode } from "react";

const CURSOR = (
  <span
    className="inline-block w-1.5 h-4 bg-current opacity-60 ml-1 align-middle animate-pulse"
    aria-hidden="true"
  />
);

function inline(text: string, keyPrefix: string, showCursor: boolean): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  const nodes = parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
  if (showCursor) nodes.push(<Fragment key={`${keyPrefix}-cursor`}>{CURSOR}</Fragment>);
  return nodes;
}

export function MarkdownContent({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1 break-words">
      {lines.map((line, i) => {
        const last = streaming && i === lines.length - 1;
        if (!line.trim()) {
          return last ? <div key={i}>{CURSOR}</div> : <div key={i} className="h-1" />;
        }
        const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
        if (heading) {
          return (
            <p key={i} className="font-semibold text-foreground">
              {inline(heading[2], `h${i}`, last)}
            </p>
          );
        }
        const bullet = line.match(/^\s*[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={i} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{inline(bullet[1], `b${i}`, last)}</span>
            </div>
          );
        }
        const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
        if (numbered) {
          return (
            <div key={i} className="flex gap-2">
              <span aria-hidden="true">{numbered[1]}.</span>
              <span>{inline(numbered[2], `n${i}`, last)}</span>
            </div>
          );
        }
        return <p key={i}>{inline(line, `p${i}`, last)}</p>;
      })}
    </div>
  );
}
