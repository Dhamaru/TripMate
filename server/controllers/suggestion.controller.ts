import { Request, Response, NextFunction } from 'express';
import { TripSuggestion } from '../models/TripSuggestion';
import { NotFoundError, ForbiddenError } from '../errors';

/**
 * Gets suggestions for the authenticated user
 */
export const getSuggestions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const suggestions = await TripSuggestion.find({ userId })
            .sort({ createdAt: -1 })
            .limit(10);

        res.status(200).json({
            success: true,
            data: suggestions
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Submits feedback for a specific suggestion
 */
export const submitFeedback = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const { suggestionId } = req.params;
        const { score, comment } = req.body;

        const suggestion = await TripSuggestion.findOneAndUpdate(
            { _id: suggestionId, userId },
            { 
                userFeedback: { score, comment },
                status: 'viewed' // Marking as viewed if they gave feedback
            },
            { new: true }
        );

        if (!suggestion) {
            throw new NotFoundError('Suggestion not found');
        }

        res.status(200).json({
            success: true,
            data: suggestion
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Dismisses a suggestion
 */
export const dismissSuggestion = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const { suggestionId } = req.params;

        const suggestion = await TripSuggestion.findOneAndUpdate(
            { _id: suggestionId, userId },
            { status: 'dismissed' },
            { new: true }
        );

        if (!suggestion) {
            throw new NotFoundError('Suggestion not found');
        }

        res.status(200).json({
            success: true,
            data: suggestion
        });
    } catch (error) {
        next(error);
    }
};
