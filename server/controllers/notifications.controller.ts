import { Request, Response, NextFunction } from "express";
import { NotificationModel } from "@shared/schema";

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = String(req.user?._id || req.user?.id);
        const notifications = await NotificationModel.find({ userId })
            .sort({ createdAt: -1 })
            .limit(50);
        const unreadCount = await NotificationModel.countDocuments({ userId, read: false });
        res.json({ notifications, unreadCount });
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
