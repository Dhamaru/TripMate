import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
};

/**
 * Trip status as an ink stamp (DESIGN.md "Stamp, Not Pill"): 2px border,
 * slight rotation, mono caps. Styles: .status-badge / .status-* in index.css.
 * `onPhoto` adds a solid backing so it stays readable over a hero image.
 */
export function TripStatusBadge({
  status,
  onPhoto,
  className,
}: {
  status?: string;
  onPhoto?: boolean;
  className?: string;
}) {
  const key = status && LABELS[status] ? status : "planning";
  return (
    <span
      className={cn(
        "status-badge",
        `status-${key}`,
        onPhoto && "!bg-[hsl(var(--card))] shadow-sm",
        className,
      )}
      aria-label={`Trip status: ${LABELS[key]}`}
      data-testid="trip-status"
    >
      {LABELS[key]}
    </span>
  );
}
