import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '../ui/button';
import { tripsApi } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';

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

  const handleVote = async (value: number) => {
    // Toggle logic: If clicking the same vote, clear it (0). Otherwise set to new value.
    const newValue = userVote === value ? 0 : value;
    const diff = newValue - (userVote || 0);

    try {
      setVotes(prev => prev + diff);
      setUserVote(newValue === 0 ? null : newValue);

      await tripsApi.toggleVote(tripId, {
        dayIndex,
        activityId,
        vote: diff
      });

      if (newValue !== 0) {
        toast({
          title: newValue > 0 ? "Vibe boosted! 🚀" : "Vibe check recorded 📉",
          description: newValue > 0 
            ? "Atlas will prioritize similar activities." 
            : "Atlas will suggest alternatives in the next loop.",
        });
      }
    } catch (err) {
      // Revert on error
      setVotes(prev => prev - diff);
      setUserVote(userVote);
      toast({
        title: "Voting failed",
        description: "Could not sync your vibe signal.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className={`h-7 w-7 transition-colors ${userVote === 1 ? 'text-green-400 bg-green-500/10' : 'text-[hsl(var(--muted-foreground))]/50 hover:text-green-400 hover:bg-green-500/10'}`}
        onClick={() => void handleVote(1)}
        title="Boost this vibe"
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`h-7 w-7 transition-colors ${userVote === -1 ? 'text-orange-400 bg-orange-500/10' : 'text-[hsl(var(--muted-foreground))]/50 hover:text-orange-400 hover:bg-orange-500/10'}`}
        onClick={() => void handleVote(-1)}
        title="Vibe check"
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
