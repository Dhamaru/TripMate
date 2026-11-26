import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PresenceMember } from "@/hooks/usePresence";

interface PresenceBubblesProps {
  // The page owns usePresence: unmounting this (e.g. while editing) used to
  // leave the trip's live room.
  members: PresenceMember[];
}

const PresenceBubbles: React.FC<PresenceBubblesProps> = ({ members }) => {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {/* -space-x-2 (avatar overlap stacking) must stay scoped to just
                    the avatars — it previously applied to this div's direct
                    children as a whole, including the "Online Now" label below,
                    pulling it left into the avatar (and whatever sits before this
                    component, e.g. the trip status badge). */}
        <div className="flex -space-x-2 items-center">
          <AnimatePresence>
            {members.map((member: PresenceMember) => (
              <motion.div
                key={member.userId}
                initial={{ opacity: 0, scale: 0.5, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.5, x: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative group cursor-pointer">
                      <Avatar className="w-8 h-8 border-2 border-background ring-2 ring-primary/10 transition-all group-hover:ring-primary/40">
                        <AvatarImage src={member.avatar} alt={member.userName} />
                        <AvatarFallback className="bg-primary/5 text-[11px] font-medium text-[var(--ink-blue-text)]">
                          {member.userName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[var(--transit-green)] border-2 border-background rounded-full"
                        aria-hidden="true"
                      />
                      <span className="sr-only">{member.userName} is online</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <p className="font-semibold">{member.userName}</p>
                    <p className="text-muted-foreground opacity-80">Currently viewing</p>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {members.length > 0 && (
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider opacity-60 whitespace-nowrap">
            Online Now
          </span>
        )}
      </div>
    </TooltipProvider>
  );
};

export default PresenceBubbles;
