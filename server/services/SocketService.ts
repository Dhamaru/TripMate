import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import { log } from "../vite";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { TripModel, SessionModel } from "@shared/schema";

interface UserPresence {
  userId: string;
  userName: string;
  avatar?: string;
  lastSeen: number;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export class SocketService {
  private static instance: SocketService;
  private io: SocketIOServer | null = null;
  private presence: Map<string, Map<string, UserPresence>> = new Map();

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
        origin: config.FRONTEND_URL || (config.NODE_ENV === "production" ? false : "*"),
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // Auth middleware — reject invalid tokens, allow missing (public/guest connections)
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      // The client never sets handshake.auth.token — the JWT lives in
      // an httpOnly "token" cookie (set in auth.controller.ts), which
      // socket.io does receive on the handshake request but does not
      // parse into handshake.auth. Without this fallback every
      // connection was treated as an unauthenticated guest, so
      // join-trip always rejected and real-time collaboration never
      // worked for any signed-in user.
      const cookieHeader = socket.handshake.headers.cookie ?? "";
      const cookieToken = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/)?.[1];
      const token = socket.handshake.auth?.token ?? cookieToken;
      if (!token) {
        // No token — unauthenticated connection allowed (read-only / public trip view)
        return next();
      }
      try {
        const decoded = jwt.verify(token, config.JWT_SECRET) as { sub: string; sid?: string };
        // requireAuth/optionalAuth both check SessionModel for
        // revocation on every HTTP request — a socket connection
        // skipped that entirely, so a signed-out or revoked session's
        // still-valid-looking JWT kept a live WebSocket receiving
        // real-time trip/presence/Atlas events for up to 7 more days.
        if (!decoded.sid) {
          return next(new Error("UNAUTHORIZED"));
        }
        const session = await SessionModel.findOne({ sessionId: decoded.sid })
          .select("revoked expiresAt")
          .lean();
        if (!session || session.revoked || session.expiresAt < new Date()) {
          return next(new Error("UNAUTHORIZED"));
        }
        socket.userId = decoded.sub;
        next();
      } catch {
        return next(new Error("UNAUTHORIZED"));
      }
    });

    this.io.on("connection", (socket: AuthenticatedSocket) => {
      log(`[Socket] Client connected: ${socket.id} (user: ${socket.userId ?? "guest"})`);

      // A personal room, independent of any trip — lets us push a
      // notification to a user regardless of what page they're on,
      // rather than only to sockets that happened to join a specific
      // trip room. Every authenticated connection gets this for free.
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
      }

      socket.on("join-trip", async ({ tripId, userName, avatar }) => {
        // Always use server-verified userId from JWT — never trust client payload
        const userId = socket.userId;
        if (!userId) {
          socket.emit("error", { message: "Authentication required to join trip room" });
          return;
        }

        // REST endpoints scope every trip query to owner-or-collaborator,
        // but this room join had no such check — any authenticated user
        // who learned a tripId (a shared link, a screenshot) could listen
        // to another trip's live itinerary/expense/collaborator events.
        // Can't write anything through sockets, but it leaked activity.
        const trip = await TripModel.findOne({
          _id: tripId,
          $or: [{ userId }, { "collaborators.userId": userId }],
        })
          .select("_id")
          .lean();
        if (!trip) {
          socket.emit("error", { message: "Not authorized to join this trip" });
          return;
        }

        socket.join(`trip:${tripId}`);
        log(`[Socket] User ${userId} joined trip room: ${tripId}`);

        if (!this.presence.has(tripId)) {
          this.presence.set(tripId, new Map());
        }
        this.presence.get(tripId)!.set(userId, {
          userId,
          userName: userName ?? "Unknown",
          avatar,
          lastSeen: Date.now(),
        });

        this.broadcastPresence(tripId);
      });

      socket.on("leave-trip", ({ tripId }) => {
        const userId = socket.userId;
        socket.leave(`trip:${tripId}`);

        if (userId && this.presence.has(tripId)) {
          this.presence.get(tripId)!.delete(userId);
          this.broadcastPresence(tripId);
        }
      });

      socket.on("disconnect", () => {
        log(`[Socket] Client disconnected: ${socket.id}`);
        // Clean up presence for this socket's user across all rooms
        if (socket.userId) {
          for (const [tripId, members] of this.presence.entries()) {
            if (members.has(socket.userId)) {
              members.delete(socket.userId);
              this.broadcastPresence(tripId);
            }
          }
        }
      });
    });
  }

  private broadcastPresence(tripId: string) {
    if (this.io && this.presence.has(tripId)) {
      const members = Array.from(this.presence.get(tripId)!.values());
      this.io.to(`trip:${tripId}`).emit("presence-update", members);
    }
  }

  public broadcastMutation(
    tripId: string,
    mutation: { type: string; data?: any },
    excludeUserId?: string,
  ) {
    if (!this.io) return;
    const room = `trip:${tripId}`;
    if (!excludeUserId) {
      this.io.to(room).emit("trip-mutation", mutation);
      return;
    }
    // broadcastMutation is called from REST controllers, not a socket
    // handler, so there's no single "sender socket" to exclude with
    // socket.to() — instead find every connected socket for this user
    // in the room (they may have multiple tabs open) and skip those,
    // so the actor doesn't get a "A collaborator updated..." toast for
    // their own change.
    const roomSocketIds = this.io.sockets.adapter.rooms.get(room);
    const excludeSocketIds = roomSocketIds
      ? [...roomSocketIds].filter(
          (id) =>
            (this.io!.sockets.sockets.get(id) as AuthenticatedSocket | undefined)?.userId ===
            excludeUserId,
        )
      : [];
    this.io.to(room).except(excludeSocketIds).emit("trip-mutation", mutation);
  }

  public broadcastAtlasThinking(tripId: string, isThinking: boolean) {
    if (this.io) {
      this.io.to(`trip:${tripId}`).emit("atlas-thinking", { isThinking });
    }
  }

  // Push a notification to every connection a user currently has open
  // (any tab, any page) — the DB row is the source of truth (so it shows
  // up on next load / other devices too); this just makes it appear live
  // without a reload for whoever's online right now.
  public pushNotification(
    userId: string,
    notification: {
      id: string;
      type: string;
      title: string;
      message: string;
      link?: string;
      createdAt: string;
    },
  ) {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit("notification", notification);
  }
}

export const socketService = SocketService.getInstance();
