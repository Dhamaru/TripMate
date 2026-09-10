import { Request, Response, NextFunction } from "express";
import { NotificationModel } from "@shared/schema";
import { socketService } from "../services/SocketService";

const PAGE_SIZE = 50;

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.user?._id || req.user?.id);
    // `before` (an ISO createdAt) lets the client page further back once
    // it's already loaded a page — without this, the 50-item cap on a
    // single query silently drops everything older once a user accumulates
    // more than 50 notifications.
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const query: Record<string, unknown> = { userId };
    if (before && !isNaN(before.getTime())) {
      query.createdAt = { $lt: before };
    }
    // Optional filters — ?read=unread and ?type=itinerary-updated
    if (req.query.read === "unread") query.read = false;
    if (req.query.read === "read") query.read = true;
    if (req.query.type) query.type = String(req.query.type);

    // Fetch one extra to know if there's another page without a false
    // positive when the total is an exact multiple of PAGE_SIZE.
    const rows = await NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE + 1);
    const hasMore = rows.length > PAGE_SIZE;
    const notifications = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    const unreadCount = await NotificationModel.countDocuments({ userId, read: false });
    res.json({ notifications, unreadCount, hasMore });
  } catch (error) {
    next(error);
  }
};

export const markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.user?._id || req.user?.id);
    const { id } = req.params;
    const notification = await NotificationModel.findOneAndUpdate(
      { _id: id, userId },
      { read: true, readAt: new Date() },
      { new: true },
    );
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    socketService.pushNotificationRead(userId, id);
    res.json(notification);
  } catch (error) {
    next(error);
  }
};

export const markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.user?._id || req.user?.id);
    await NotificationModel.updateMany({ userId, read: false }, { read: true, readAt: new Date() });
    socketService.pushNotificationRead(userId, "all");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
