import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import { log } from "../vite";
import jwt from "jsonwebtoken";
import { config } from "../config";

interface UserPresence {
    userId: string;
    userName: string;
    avatar?: string;
    lastSeen: number;
}

export class SocketService {
    private static instance: SocketService;
    private io: SocketIOServer | null = null;
    private presence: Map<string, Map<string, UserPresence>> = new Map(); // tripId -> userId -> presence

    private constructor() {}

    public static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    public init(server: HTTPServer) {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: "*", // Adjust in production
                methods: ["GET", "POST"],
                credentials: true
            }
        });
        
        this.io.use((socket, next) => {
            const token = socket.handshake.auth?.token;
            if (!token) {
                log(`[Socket] Auth warning: No token provided, continuing as guest/session user`);
                return next();
            }

            try {
                const decoded = jwt.verify(token, config.JWT_SECRET) as { sub: string };
                (socket as any).userId = decoded.sub;
                next();
            } catch (err) {
                log(`[Socket] Auth failed: Invalid token, but continuing`);
                next();
            }
        });

        this.io.on("connection", (socket: Socket) => {
            log(`[Socket] Client connected: ${socket.id}`);

            socket.on("join-trip", ({ tripId, userId, userName, avatar }) => {
                socket.join(`trip:${tripId}`);
                log(`[Socket] User ${userId} joined trip room: ${tripId}`);
                
                // Track presence
                if (!this.presence.has(tripId)) {
                    this.presence.set(tripId, new Map());
                }
                this.presence.get(tripId)!.set(userId, {
                    userId,
                    userName,
                    avatar,
                    lastSeen: Date.now()
                });

                this.broadcastPresence(tripId);
            });

            socket.on("leave-trip", ({ tripId, userId }) => {
                socket.leave(`trip:${tripId}`);
                log(`[Socket] User ${userId} left trip room: ${tripId}`);
                
                if (this.presence.has(tripId)) {
                    this.presence.get(tripId)!.delete(userId);
                    this.broadcastPresence(tripId);
                }
            });

            socket.on("disconnect", () => {
                log(`[Socket] Client disconnected: ${socket.id}`);
                // Simple disconnect handling - in a real app, track socketId -> {tripId, userId}
                // for automatic presence removal.
            });
        });
    }

    private broadcastPresence(tripId: string) {
        if (this.io && this.presence.has(tripId)) {
            const members = Array.from(this.presence.get(tripId)!.values());
            this.io.to(`trip:${tripId}`).emit("presence-update", members);
        }
    }

    public broadcastMutation(tripId: string, mutation: { type: string; data?: any }) {
        if (this.io) {
            log(`[Socket] Broadcasting mutation: ${mutation.type} in trip ${tripId}`);
            this.io.to(`trip:${tripId}`).emit("trip-mutation", mutation);
        }
    }

    public broadcastAtlasThinking(tripId: string, isThinking: boolean) {
        if (this.io) {
            this.io.to(`trip:${tripId}`).emit("atlas-thinking", { isThinking });
        }
    }
}

export const socketService = SocketService.getInstance();
