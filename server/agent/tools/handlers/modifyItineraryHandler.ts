// Modify Itinerary Handler — Surgical edits to trip itinerary
// Supports: replace_day, add_activity, remove_activity, swap_activities

import type { ToolResult } from '../../types';
import { TripModel } from '@shared/schema';
import { nanoid } from 'nanoid';
import { FeasibilityModeler } from '../../../services/FeasibilityModeler';

export async function modifyItineraryHandler(
    args: {
        tripId: string;
        userId: string;
        action: 'replace_day' | 'add_activity' | 'remove_activity' | 'swap_activities';
        dayIndex: number;
        activityId?: string;
        activity?: any;
        activities?: any[];
    },
    deps?: { aiService?: any, TripModel?: any }
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const tripId = (args.tripId || '').trim();
        const userId = (args.userId || '').trim();

        if (!tripId || !userId) {
            return { success: false, error: 'tripId and userId are required', durationMs: Date.now() - start };
        }

        const Model = deps?.TripModel || TripModel;
        const doc = await Model.findOne({ _id: tripId, userId });
        if (!doc) {
            return { success: false, error: 'Trip not found', durationMs: Date.now() - start };
        }

        const itinerary = JSON.parse(JSON.stringify(doc.itinerary || []));
        const dayIndex = args.dayIndex;

        if (dayIndex < 0 || dayIndex >= itinerary.length) {
            return { success: false, error: `Invalid dayIndex: ${dayIndex}. Trip has ${itinerary.length} days.`, durationMs: Date.now() - start };
        }

        let message = '';
        const modeler = new FeasibilityModeler();

        switch (args.action) {
            case 'replace_day': {
                if (!args.activities) {
                    return { success: false, error: 'activities array required for replace_day', durationMs: Date.now() - start };
                }
                
                // Try to resolve coordinates for activities that lack them
                if (deps?.aiService?.resolveCoordinates) {
                    for (const act of args.activities) {
                        if (!act.latitude && act.address) {
                            const coords = await deps.aiService.resolveCoordinates(act.address);
                            if (coords) {
                                act.latitude = coords.lat;
                                act.longitude = coords.lon;
                            }
                        }
                    }
                }

                itinerary[dayIndex].activities = args.activities.map((act: any) => ({
                    id: act.id || nanoid(8),
                    ...act
                }));
                message = `Day ${dayIndex + 1} itinerary completely replaced.`;
                break;
            }

            case 'add_activity': {
                if (!args.activity) {
                    return { success: false, error: 'activity object required for add_activity', durationMs: Date.now() - start };
                }
                
                const act = { ...args.activity };
                if (!act.latitude && act.address && deps?.aiService?.resolveCoordinates) {
                    const coords = await deps.aiService.resolveCoordinates(act.address);
                    if (coords) {
                        act.latitude = coords.lat;
                        act.longitude = coords.lon;
                    }
                }

                const newActivity = {
                    id: act.id || nanoid(8),
                    ...act
                };
                itinerary[dayIndex].activities.push(newActivity);
                message = `Added activity "${newActivity.title}" to Day ${dayIndex + 1}.`;
                break;
            }
// ... [keeping existing remove/swap logic]
            case 'remove_activity': {
                if (!args.activityId) {
                    return { success: false, error: 'activityId required for remove_activity', durationMs: Date.now() - start };
                }
                const initialCount = itinerary[dayIndex].activities.length;
                itinerary[dayIndex].activities = itinerary[dayIndex].activities.filter(
                    (a: any) => a.id !== args.activityId && a.title !== args.activityId
                );
                if (itinerary[dayIndex].activities.length === initialCount) {
                    return { success: false, error: `Activity with ID/Title "${args.activityId}" not found on Day ${dayIndex + 1}`, durationMs: Date.now() - start };
                }
                message = `Removed activity "${args.activityId}" from Day ${dayIndex + 1}.`;
                break;
            }

            case 'swap_activities': {
                if (!args.activityId || !args.activity) {
                    return { success: false, error: 'activityId and new activity object required for swap_activities', durationMs: Date.now() - start };
                }
                const idx = itinerary[dayIndex].activities.findIndex((a: any) => a.id === args.activityId || a.title === args.activityId);
                if (idx === -1) {
                    return { success: false, error: `Activity "${args.activityId}" not found on Day ${dayIndex + 1}`, durationMs: Date.now() - start };
                }
                
                const act = { ...args.activity };
                if (!act.latitude && act.address && deps?.aiService?.resolveCoordinates) {
                    const coords = await deps.aiService.resolveCoordinates(act.address);
                    if (coords) {
                        act.latitude = coords.lat;
                        act.longitude = coords.lon;
                    }
                }

                itinerary[dayIndex].activities[idx] = {
                    ...itinerary[dayIndex].activities[idx],
                    ...act,
                    id: itinerary[dayIndex].activities[idx].id
                };
                message = `Updated activity "${args.activityId}" on Day ${dayIndex + 1}.`;
                break;
            }

            default:
                return { success: false, error: `Unknown action: ${args.action}`, durationMs: Date.now() - start };
        }

        // Auto-sort by time
        itinerary[dayIndex].activities.sort((a: any, b: any) => {
            const parseTime = (t: string): number => {
                const match = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
                if (!match) return 0;
                let h = parseInt(match[1], 10);
                const m = parseInt(match[2], 10);
                if (match[3]?.toUpperCase() === 'PM' && h !== 12) h += 12;
                if (match[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
                return h * 60 + m;
            };
            return parseTime(a.time) - parseTime(b.time);
        });

        // FEASIBILITY CHECK
        const evaluation = modeler.evaluatePlan(
            { itinerary, currency: doc.currency },
            { budget: doc.budget, travelStyle: doc.travelStyle }
        );

        if (!evaluation.isFeasible) {
            return {
                success: false,
                error: 'Proposed itinerary change is physically or logistically infeasible.',
                data: {
                    corrections: evaluation.corrections,
                    feasibilityScore: evaluation.feasibilityScore
                },
                durationMs: Date.now() - start
            };
        }

        doc.itinerary = itinerary;
        doc.markModified('itinerary');
        await doc.save();

        return {
            success: true,
            data: {
                message,
                dayIndex,
                activities: itinerary[dayIndex].activities,
                feasibilityScore: evaluation.feasibilityScore,
                warnings: evaluation.corrections.filter(c => !c.includes('impossible') && !c.includes('Conflict')),
                mutations: [
                    { type: 'itinerary_updated', tripId, dayIndex }
                ]
            },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Itinerary modification failed', durationMs: Date.now() - start };
    }
}
