import { Request, Response, NextFunction } from "express";
import { TripModel } from "@shared/schema";
import { NotFoundError } from "../errors";
import { nanoid } from "nanoid";
import { socketService } from "../services/SocketService";

export const addExpense = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tripId = req.params.id;
        const userId = req.user!._id;
        const expenseData = req.body;

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [
                { userId },
                { collaborators: { $elemMatch: { userId, role: "editor" } } }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const newExpense = {
            ...expenseData,
            id: nanoid(),
            date: expenseData.date || new Date()
        };

        if (!trip.expenses) trip.expenses = [];
        trip.expenses.push(newExpense);
        
        await trip.save();

        socketService.broadcastMutation(tripId, { type: "expenses-updated", data: trip.expenses });

        res.status(201).json(trip);
    } catch (error) {
        next(error);
    }
};

export const updateExpense = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id: tripId, expenseId } = req.params;
        const userId = req.user!._id;
        const updateData = req.body;

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [
                { userId },
                { collaborators: { $elemMatch: { userId, role: "editor" } } }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const expense = trip.expenses?.find(e => e.id === expenseId);
        if (!expense) throw new NotFoundError("Expense not found");

        Object.assign(expense, updateData);
        trip.markModified("expenses");
        await trip.save();

        socketService.broadcastMutation(tripId, { type: "expenses-updated", data: trip.expenses });

        res.json(trip);
    } catch (error) {
        next(error);
    }
};

export const deleteExpense = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id: tripId, expenseId } = req.params;
        const userId = req.user!._id;

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [
                { userId },
                { collaborators: { $elemMatch: { userId, role: "editor" } } }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        if (trip.expenses) {
            trip.expenses = trip.expenses.filter(e => e.id !== expenseId);
            await trip.save();
            socketService.broadcastMutation(tripId, { type: "expenses-updated", data: trip.expenses });
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};
