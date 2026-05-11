import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = () => {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // Initialize socket connection
        const socket = io({
            path: '/socket.io',
            transports: ['websocket'],
            withCredentials: true,
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[Socket] Connected to server:', socket.id);
        });

        socket.on('connect_error', (error) => {
            console.error('[Socket] Connection error:', error);
        });

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected from server:', reason);
        });

        return () => {
            if (socket.connected) {
                socket.disconnect();
            }
        };
    }, []);

    return socketRef;
};
