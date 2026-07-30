import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Module-level singleton: every caller of useSocket() must share the SAME
// connection. Previously each call created its own independent `io()`
// connection — on TripDetail.tsx, the direct useSocket() call (listening for
// trip-mutation) and PresenceBubbles' internal usePresence -> useSocket()
// call (which emits join-trip) ended up on two disconnected sockets, so the
// socket that actually joined the trip room never listened for mutations,
// and the one listening never joined any room. Live updates never worked.
let sharedSocket: Socket | null = null;
let refCount = 0;

function getSharedSocket(): Socket {
    if (!sharedSocket) {
        sharedSocket = io({
            path: '/socket.io',
            transports: ['websocket'],
            withCredentials: true,
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        sharedSocket.on('connect', () => {
            console.log('[Socket] Connected to server:', sharedSocket!.id);
        });
        sharedSocket.on('connect_error', (error) => {
            console.error('[Socket] Connection error:', error);
        });
        sharedSocket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected from server:', reason);
        });
    }
    return sharedSocket;
}

export const useSocket = () => {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const socket = getSharedSocket();
        socketRef.current = socket;
        refCount++;

        return () => {
            refCount--;
            if (refCount <= 0 && sharedSocket) {
                sharedSocket.disconnect();
                sharedSocket = null;
                refCount = 0;
            }
        };
    }, []);

    return socketRef;
};
