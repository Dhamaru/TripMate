import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePresence, PresenceMember } from '@/hooks/usePresence';

interface PresenceBubblesProps {
    tripId: string;
}

const PresenceBubbles: React.FC<PresenceBubblesProps> = ({ tripId }) => {
    const { members } = usePresence(tripId);

    return (
        <TooltipProvider>
            <div className="flex -space-x-2 items-center">
                <AnimatePresence>
                    {members.map((member: PresenceMember) => (
                        <motion.div
                            key={member.userId}
                            initial={{ opacity: 0, scale: 0.5, x: 20 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.5, x: -20 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        >
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="relative group cursor-pointer">
                                        <Avatar className="w-8 h-8 border-2 border-background ring-2 ring-primary/10 transition-all group-hover:ring-primary/40">
                                            <AvatarImage src={member.avatar} alt={member.userName} />
                                            <AvatarFallback className="bg-primary/5 text-[10px] font-medium text-primary">
                                                {member.userName.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
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
                {members.length > 0 && (
                    <span className="ml-4 text-[10px] text-muted-foreground font-medium uppercase tracking-wider opacity-60">
                        Online Now
                    </span>
                )}
            </div>
        </TooltipProvider>
    );
};

export default PresenceBubbles;
