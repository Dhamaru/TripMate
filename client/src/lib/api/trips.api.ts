import client from "./client";
import type { Trip, CreateTripRequest } from "../../types/api.types";

export const tripsApi = {
  list: () => client.get<Trip[], Trip[]>("/api/v1/trips"),
  get: (id: string) => client.get<Trip, Trip>(`/api/v1/trips/${id}`),
  create: (data: CreateTripRequest) => client.post<Trip, Trip>("/api/v1/trips", data),
  delete: (id: string) => client.delete(`/api/v1/trips/${id}`),
  getCollaborators: (tripId: string) =>
    client.get<any[], any[]>(`/api/v1/trips/${tripId}/collaborators`),
  addCollaborator: (tripId: string, data: { email: string; role: string }) =>
    client.post<any, any>(`/api/v1/trips/${tripId}/collaborators`, data),
  removeCollaborator: (tripId: string, collaboratorId: string) =>
    client.delete(`/api/v1/trips/${tripId}/collaborators/${collaboratorId}`),
  toggleVote: (tripId: string, data: { dayIndex: number; activityId: string; vote: number }) =>
    client.post<Trip, Trip>(`/api/v1/trips/${tripId}/itinerary/vote`, data),
};
