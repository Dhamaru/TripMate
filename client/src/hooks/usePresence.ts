import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';
import { useAuth } from './useAuth';

export interface PresenceMember {
    userId: string;
    userName: string;
    avatar?: string;
    lastSeen: number;
}

export const usePresence = (tripId: string) => {
    const socketRef = useSocket();
    const { user } = useAuth();
    const [members, setMembers] = useState<PresenceMember[]>([]);

    useEffect(() => {
        const socket = socketRef.current;
        if (!socket || !tripId || !user) return;

        // Join trip room with user info
        socket.emit('join-trip', {
            tripId,
            userId: user.id,
            userName: `${user.firstName} ${user.lastName}`.trim(),
            avatar: user.avatar || user.profileImageUrl,
        });

        // Listen for presence updates
        socket.on('presence-update', (updatedMembers: PresenceMember[]) => {
            console.log('[Presence] Members updated:', updatedMembers);
            setMembers(updatedMembers);
        });

        // Cleanup on unmount or tripId change
        return () => {
            socket.emit('leave-trip', { tripId, userId: user.id });
            socket.off('presence-update');
        };
    }, [tripId, user, socketRef]);

    return { members };
};
