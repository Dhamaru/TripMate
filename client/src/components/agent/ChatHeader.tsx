// Task 7 — Chat header with clear and close actions
import { useAgentStore, useTripStore } from "../../store";
import { TripMateLogo } from "../TripMateLogo";

interface Props {
  onClose: () => void;
}

export function ChatHeader({ onClose }: Props) {
  const clearConversation = useAgentStore((s) => s.clearConversation);
  const currentTripId = useAgentStore((s) => s.context.currentTripId);
  const currentTrip = useTripStore((s) => s.currentTrip);
  // Chat history is now per-trip and this same floating panel appears on
  // every page — without this, switching from planning "Kerala Trip" to
  // "Goa Trip" silently swaps the conversation's contents with nothing
  // visibly signalling why, which reads as Atlas randomly forgetting
  // things rather than a deliberate, separate thread.
  const threadLabel =
    currentTripId && currentTrip?.id === currentTripId
      ? `Planning: ${currentTrip.destination}`
      : "General planning";
  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
      <div className="flex items-center gap-3">
        {/* Same gradient-arrow mark as the Atlas trigger button and the
                    app logo — was a 🌍 emoji, the one place Atlas didn't carry
                    the unified brand mark used everywhere else this session. */}
        <TripMateLogo size="sm" showText={false} />
        <div>
          <h2 className="text-foreground text-sm font-semibold leading-tight">Atlas AI</h2>
          <span className="text-xs text-[var(--explorer-blue)]">{threadLabel}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
          onClick={clearConversation}
          aria-label="Clear conversation"
        >
          Clear
        </button>
        <button
          className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
          onClick={onClose}
          aria-label="Close Atlas chat panel"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
