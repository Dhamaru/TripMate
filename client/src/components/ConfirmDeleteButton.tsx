import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Trash button that needs a second tap: the first tap turns it into a red
 * "Delete?" for 4 seconds. Deleting an activity or expense used to happen on
 * a single (easily mistaken) tap with no undo.
 */
export function ConfirmDeleteButton({
  onConfirm,
  label,
  className,
  testId,
}: {
  onConfirm: () => void;
  label: string;
  className?: string;
  testId?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <Button
      type="button"
      variant="ghost"
      size={armed ? "sm" : "icon"}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      aria-label={armed ? `Confirm: ${label}` : label}
      data-testid={testId}
      className={cn(
        "h-10 shrink-0",
        armed
          ? "px-3 bg-[var(--stamp-red)] text-white hover:bg-[var(--stamp-red-deep)] hover:text-white"
          : "w-10 text-[var(--stamp-red-text)] hover:bg-[rgb(var(--stamp-red-rgb)/10%)]",
        className,
      )}
    >
      {armed ? "Delete?" : <Trash2 className="w-4 h-4" />}
    </Button>
  );
}
