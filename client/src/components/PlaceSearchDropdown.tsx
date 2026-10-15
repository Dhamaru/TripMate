import { useEffect, useState, type KeyboardEvent } from "react";
import { Loader2, MapPin } from "lucide-react";
import type { PlaceSuggestion } from "@/hooks/usePlaceSuggestions";

interface Props {
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  visible: boolean;
  onSelect: (place: PlaceSuggestion) => void;
  /** Keyboard-highlighted row, from usePlaceSearchKeys. */
  activeIndex?: number;
  className?: string;
}

/**
 * Arrow/Enter/Escape handling for the input that owns a PlaceSearchDropdown.
 * Enter picks the highlighted suggestion (the first one if the user never
 * arrowed) instead of submitting the surrounding form with a half-typed
 * name like "Hyder". Returns handled=false when there's nothing to pick, so
 * a caller with its own Enter action (e.g. Emergency's search) can run it.
 */
export function usePlaceSearchKeys(
  suggestions: PlaceSuggestion[],
  visible: boolean,
  onSelect: (place: PlaceSuggestion) => void,
  onClose: () => void,
  isLoading = false,
) {
  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => setActiveIndex(-1), [suggestions, visible]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): boolean => {
    if (e.nativeEvent.isComposing) return false; // Enter confirming IME input
    if (visible && isLoading && e.key === "Enter") {
      // Suggestions on screen are for older text; don't pick one, and don't
      // submit the half-typed value either.
      e.preventDefault();
      return true;
    }
    const open = visible && suggestions.length > 0;
    if (!open) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => (i + step + suggestions.length) % suggestions.length);
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      onSelect(suggestions[Math.max(activeIndex, 0)]);
      return true;
    }
    if (e.key === "Escape") {
      onClose();
      return true;
    }
    return false;
  };

  return { activeIndex, onKeyDown };
}

/**
 * Shared suggestions dropdown for every place-search input in the app —
 * one visual/behavioral implementation instead of a slightly different
 * copy per search bar. Absolutely positioned; the parent must be
 * `relative`.
 */
export function PlaceSearchDropdown({
  suggestions,
  isLoading,
  visible,
  onSelect,
  activeIndex = -1,
  className,
}: Props) {
  if (!visible || (!isLoading && suggestions.length === 0)) return null;

  return (
    <div
      role="listbox"
      className={`absolute z-50 left-0 right-0 mt-1 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden backdrop-blur-xl ${className ?? ""}`}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {isLoading && suggestions.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Searching…
        </div>
      ) : (
        suggestions.map((place, i) => (
          <button
            key={place.id}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            // Keeps focus in the input: the input's onBlur hides this list
            // after 150ms, which a slow tap could lose the race against.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(place)}
            className={`w-full text-left px-4 py-2.5 hover:bg-[var(--amber-dim)] border-b border-[hsl(var(--border))] last:border-0 transition-colors group flex items-start gap-2.5 ${i === activeIndex ? "bg-[var(--amber-dim)]" : ""}`}
          >
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-[var(--amber)]" />
            <div className="min-w-0">
              <div className="font-medium text-[hsl(var(--foreground))] group-hover:text-[var(--amber)] transition-colors truncate">
                {place.name || place.display_name?.split(",")[0]}
              </div>
              {place.address && (
                <div className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                  {place.address}
                </div>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  );
}
