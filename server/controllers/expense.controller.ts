import { Request, Response, NextFunction } from "express";
import { TripModel } from "@shared/schema";
import { NotFoundError } from "../errors";
import { nanoid } from "nanoid";
import { socketService } from "../services/SocketService";
import { notifyTripParticipants } from "../notifications";

const editorAccessFilter = (tripId: string, userId: string) => ({
  _id: tripId,
  $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
});

export const addExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tripId = req.params.id;
    const userId = req.user!._id;
    const expenseData = req.body;

    const newExpense = {
      ...expenseData,
      id: nanoid(),
      date: expenseData.date || new Date(),
    };

    const trip = await TripModel.findOneAndUpdate(
      editorAccessFilter(tripId, String(userId)),
      { $push: { expenses: newExpense } },
      { new: true },
    );
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    socketService.broadcastMutation(
      tripId,
      { type: "expenses-updated", data: trip.expenses },
      String(userId),
    );
    await notifyTripParticipants(trip, String(userId), {
      type: "expense-updated",
      title: "Expense added",
      message: `${newExpense.amount} ${newExpense.currency} (${newExpense.category}) added to your trip to ${trip.destination}.`,
      link: `/app/trips/${tripId}`,
      tripId,
    });

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

    const setFields = Object.fromEntries(
      Object.entries(updateData).map(([key, value]) => [`expenses.$[elem].${key}`, value]),
    );

    const trip = await TripModel.findOneAndUpdate(
      { ...editorAccessFilter(tripId, String(userId)), "expenses.id": expenseId },
      { $set: setFields },
      { new: true, arrayFilters: [{ "elem.id": expenseId }] },
    );
    if (!trip) throw new NotFoundError("Trip not found, expense not found, or access denied");

    socketService.broadcastMutation(
      tripId,
      { type: "expenses-updated", data: trip.expenses },
      String(userId),
    );
    await notifyTripParticipants(trip, String(userId), {
      type: "expense-updated",
      title: "Expense updated",
      message: `An expense was updated on your trip to ${trip.destination}.`,
      link: `/app/trips/${tripId}`,
      tripId,
    });

    res.json(trip);
  } catch (error) {
    next(error);
  }
};

export const deleteExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: tripId, expenseId } = req.params;
    const userId = req.user!._id;

    const trip = await TripModel.findOneAndUpdate(
      editorAccessFilter(tripId, String(userId)),
      { $pull: { expenses: { id: expenseId } } },
      { new: true },
    );
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    socketService.broadcastMutation(
      tripId,
      { type: "expenses-updated", data: trip.expenses },
      String(userId),
    );
    await notifyTripParticipants(trip, String(userId), {
      type: "expense-updated",
      title: "Expense removed",
      message: `An expense was removed from your trip to ${trip.destination}.`,
      link: `/app/trips/${tripId}`,
      tripId,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
