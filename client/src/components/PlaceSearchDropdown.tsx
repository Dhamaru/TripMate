import { Loader2, MapPin } from "lucide-react";
import type { PlaceSuggestion } from "@/hooks/usePlaceSuggestions";

interface Props {
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  visible: boolean;
  onSelect: (place: PlaceSuggestion) => void;
  className?: string;
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
  className,
}: Props) {
  if (!visible || (!isLoading && suggestions.length === 0)) return null;

  return (
    <div
      className={`absolute z-50 left-0 right-0 mt-1 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-2xl overflow-hidden backdrop-blur-xl ${className ?? ""}`}
    >
      {isLoading && suggestions.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Searching…
        </div>
      ) : (
        suggestions.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelect(place)}
            className="w-full text-left px-4 py-2.5 hover:bg-[var(--amber-dim)] border-b border-[hsl(var(--border))] last:border-0 transition-colors group flex items-start gap-2.5"
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
