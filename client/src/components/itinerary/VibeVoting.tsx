import { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "../ui/button";
import { apiRequestJson } from "../../lib/queryClient";
import type { Trip } from "../../types/api.types";
import { useToast } from "../../hooks/use-toast";

interface Props {
  tripId: string;
  dayIndex: number;
  activityId: string;
  initialVotes?: number;
}

export function VibeVoting({ tripId, dayIndex, activityId, initialVotes = 0 }: Props) {
  const [votes, setVotes] = useState(initialVotes);
  const [userVote, setUserVote] = useState<number | null>(null);
  const { toast } = useToast();

  // initialVotes only seeded state on mount -- when a COLLABORATOR votes on
  // this same activity, the resulting socket broadcast -> fetchTrip ->
  // updated trip.itinerary prop never reached this component's own state,
  // since it has no key forcing a remount. The count stayed frozen at
  // whatever it was when this component first mounted, until a full page
  // reload. The reconciliation in handleVote below only ever fires after
  // the CURRENT user's own vote, not a remote one.
  useEffect(() => {
    setVotes(initialVotes);
  }, [initialVotes]);

  const handleVote = async (value: number) => {
    // Toggle logic: If clicking the same vote, clear it (0). Otherwise set to new value.
    // The server is authoritative on the vote total (it tracks who voted what
    // and computes the real delta) — this component sends the caller's
    // DESIRED final state, not a locally-computed diff, so a stale/reset
    // local `userVote` (reload, new device, etc.) can never double-count.
    const newValue = userVote === value ? 0 : value;
    const diff = newValue - (userVote || 0);

    try {
      setVotes((prev) => prev + diff);
      setUserVote(newValue === 0 ? null : newValue);

      const updated = await apiRequestJson<Trip>("POST", `/api/v1/trips/${tripId}/itinerary/vote`, {
        dayIndex,
        activityId,
        vote: newValue,
      });

      // Reconcile with the server's real count in case our optimistic diff
      // (based on possibly-stale local state) didn't match reality.
      const serverActivity = updated?.itinerary
        ?.find((d) => d.dayIndex === dayIndex)
        ?.activities.find((a: any) => a.id === activityId);
      if (typeof serverActivity?.votes === "number") {
        setVotes(serverActivity.votes);
      }

      if (newValue !== 0) {
        toast({
          title: newValue > 0 ? "Vote recorded: more of this" : "Vote recorded: less of this",
          description:
            newValue > 0
              ? "Atlas will prioritize similar activities."
              : "Atlas will suggest alternatives in the next loop.",
        });
      }
    } catch (err) {
      // Revert on error
      setVotes((prev) => prev - diff);
      setUserVote(userVote);
      toast({
        title: "Voting failed",
        description: "Could not sync your vibe signal.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className={`h-10 w-10 transition-colors ${userVote === 1 ? "text-[var(--transit-green-text)] bg-[rgb(var(--transit-green-rgb)/12%)]" : "text-muted-foreground hover:text-[var(--transit-green-text)] hover:bg-[rgb(var(--transit-green-rgb)/12%)]"}`}
        onClick={() => void handleVote(1)}
        title="Boost this vibe"
        aria-label="Vote up"
        aria-pressed={userVote === 1}
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`h-10 w-10 transition-colors ${userVote === -1 ? "text-[var(--stamp-red-text)] bg-[rgb(var(--stamp-red-rgb)/12%)]" : "text-muted-foreground hover:text-[var(--stamp-red-text)] hover:bg-[rgb(var(--stamp-red-rgb)/12%)]"}`}
        onClick={() => void handleVote(-1)}
        title="Vibe check"
        aria-label="Vote down"
        aria-pressed={userVote === -1}
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
