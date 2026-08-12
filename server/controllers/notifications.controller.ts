import { Request, Response, NextFunction } from "express";
import { NotificationModel } from "@shared/schema";

const PAGE_SIZE = 50;

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = String(req.user?._id || req.user?.id);
        // `before` (an ISO createdAt) lets the client page further back once
        // it's already loaded a page — without this, the 50-item cap on a
        // single query silently drops everything older, with no way to see
        // it, once a user accumulates more than 50 notifications.
        const before = req.query.before ? new Date(String(req.query.before)) : null;
        const query: Record<string, unknown> = { userId };
        if (before && !isNaN(before.getTime())) {
            query.createdAt = { $lt: before };
        }
        const notifications = await NotificationModel.find(query)
            .sort({ createdAt: -1 })
            .limit(PAGE_SIZE);
        const unreadCount = await NotificationModel.countDocuments({ userId, read: false });
        const hasMore = notifications.length === PAGE_SIZE;
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
            { read: true },
            { new: true }
        );
        if (!notification) return res.status(404).json({ error: "Notification not found" });
        res.json(notification);
    } catch (error) {
        next(error);
    }
};

export const markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = String(req.user?._id || req.user?.id);
        await NotificationModel.updateMany({ userId, read: false }, { read: true });
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
};
