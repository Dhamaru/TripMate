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
    <div className="flex items-center gap-1 mt-2">
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 px-2 gap-1.5 transition-colors ${userVote === 1 ? 'text-green-500 bg-green-500/10 hover:bg-green-500/20' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => void handleVote(1)}
        title="Boost this vibe"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{votes > 0 ? votes : ''}</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={`h-7 px-2 transition-colors ${userVote === -1 ? 'text-orange-500 bg-orange-500/10 hover:bg-orange-500/20' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => void handleVote(-1)}
        title="Vibe check (low priority)"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
