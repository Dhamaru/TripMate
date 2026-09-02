// Task 7 — Chat input with auto-resize and char counter
import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent } from "react";
import { useAgentStore } from "../../store";

export function ChatInput() {
  const [text, setText] = useState("");
  const { isLoading, streamMessage } = useAgentStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_CHARS = 2000;
  const COUNTER_THRESHOLD = 1800;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  // Focus the input as soon as the panel opens, and redirect any typing
  // back to it for as long as the panel stays open — ChatInput only exists
  // in the tree while isChatOpen is true (AgentOverlayPanel renders null
  // otherwise), so this mount/unmount lifecycle already matches "open
  // until closed" without tracking isChatOpen directly. Lets a user open
  // Atlas and start typing immediately without clicking the text box first,
  // even after focus drifts to a button (e.g. after clicking Send).
  useEffect(() => {
    textareaRef.current?.focus();

    const redirectTypingToInput = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const alreadyEditable =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (alreadyEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1 || e.key === "Backspace") {
        // Focusing before the browser finishes this keydown redirects
        // the resulting character into the textarea instead of
        // wherever focus was (or nowhere, if it was on the body).
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", redirectTypingToInput);
    return () => window.removeEventListener("keydown", redirectTypingToInput);
  }, []);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setText("");
    await streamMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-2 p-3 border-t border-border bg-card">
      <textarea
        ref={textareaRef}
        className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground max-h-32 py-2 focus-visible:ring-2 focus-visible:ring-[rgb(var(--explorer-blue-rgb)/40%)] rounded"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder="Ask Atlas anything..."
        rows={1}
        aria-label="Message to Atlas"
        aria-disabled={isLoading}
      />
      {text.length >= COUNTER_THRESHOLD && (
        <span
          className="absolute right-14 bottom-14 text-[10px] text-muted-foreground"
          aria-label={`${MAX_CHARS - text.length} characters remaining`}
        >
          {MAX_CHARS - text.length}
        </span>
      )}
      <button
        className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--explorer-blue)] text-white hover:bg-[var(--explorer-blue-deep)] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 mb-1 transition-colors"
        onClick={() => void handleSubmit()}
        disabled={isLoading || !text.trim()}
        aria-label="Send message"
      >
        {isLoading ? (
          <span
            className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"
            aria-hidden="true"
          />
        ) : (
          <span className="text-sm font-bold" aria-hidden="true">
            ↑
          </span>
        )}
      </button>
    </div>
  );
}
