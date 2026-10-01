import { create } from "zustand";
import type { Trip, CreateTripRequest } from "../types/api.types";
import { apiRequestJson, ApiRequestError } from "../lib/queryClient";

// ApiRequestError carries the real HTTP status, so a failure can be told
// apart as a 401 (not logged in yet), a 404 (really doesn't exist / not
// yours), or a network blip instead of all collapsing to the same generic
// "Trip Not Found" message regardless of cause.
function describeError(e: unknown, fallback: string): { message: string; status?: number } {
  if (e instanceof ApiRequestError) return { message: e.message || fallback, status: e.status };
  if (e instanceof Error) return { message: e.message };
  return { message: fallback };
}

interface TripStore {
  trips: Trip[];
  currentTrip: Trip | null;
  isLoading: boolean;
  error: string | null;
  errorStatus: number | null;
  fetchTrips: () => Promise<void>;
  fetchTrip: (id: string) => Promise<void>;
  createTrip: (data: CreateTripRequest) => Promise<Trip>;
  deleteTrip: (id: string) => Promise<void>;
  setCurrentTrip: (trip: Trip | null) => void;
  updateItineraryDay: (dayIndex: number, day: Trip["itinerary"][0]) => void;
}

// fetchTrip is called far more than once per page view — once on mount,
// then again every time TripDetail.tsx's socket listener sees an
// "itinerary-updated"/"expenses-updated"/etc. broadcast, which fires
// once per Atlas turn. Two Atlas turns close together (e.g. "add these
// spots" immediately followed by "now change that one's time") fire two
// overlapping fetchTrip calls, and this had no protection against the
// EARLIER call's response arriving AFTER the LATER call's — live-
// reported: after two rapid Atlas edits, the itinerary panel showed
// neither edit, just the pre-session state, because a slow/late-
// resolving earlier request (very plausibly the initial-mount fetch
// itself) overwrote the fresher data a faster later request had already
// applied. A simple monotonic sequence guard fixes this without needing
// AbortController plumbing through the whole call chain — only the
// response from the MOST RECENTLY FIRED call is ever allowed to write
// to state; anything that resolves after being superseded is silently
// discarded instead of corrupting the display with stale data.
let fetchTripSeq = 0;

export const useTripStore = create<TripStore>((set, get) => ({
  trips: [],
  currentTrip: null,
  isLoading: false,
  error: null,
  errorStatus: null,
  fetchTrips: async () => {
    set({ isLoading: true, error: null, errorStatus: null });
    try {
      const trips = await apiRequestJson<Trip[]>("GET", "/api/v1/trips");
      set({ trips: Array.isArray(trips) ? trips : [], isLoading: false });
    } catch (e: unknown) {
      const { message, status } = describeError(e, "Failed to fetch trips");
      set({ error: message, errorStatus: status ?? null, isLoading: false });
    }
  },
  fetchTrip: async (id) => {
    const seq = ++fetchTripSeq;
    // Clear any stale error/status from a previous attempt before this
    // one resolves — otherwise a successful refetch after a transient
    // failure could still be judged against the old error state.
    set({ isLoading: true, error: null, errorStatus: null });
    try {
      const trip = await apiRequestJson<Trip>("GET", `/api/v1/trips/${id}`);
      // A newer fetchTrip call started after this one — its response
      // (whenever it lands) is the one that should win. Discard this
      // stale one rather than overwriting fresher state with old data.
      if (seq !== fetchTripSeq) return;
      set({ currentTrip: trip, isLoading: false });
    } catch (e: unknown) {
      if (seq !== fetchTripSeq) return;
      const { message, status } = describeError(e, "Failed to fetch trip");
      set({ error: message, errorStatus: status ?? null, isLoading: false });
    }
  },
  createTrip: async (data) => {
    const trip = await apiRequestJson<Trip>("POST", "/api/v1/trips", data);
    set((state) => ({ trips: [trip, ...state.trips] }));
    return trip;
  },
  deleteTrip: async (id) => {
    const previous = get().trips;
    set((state) => ({ trips: state.trips.filter((t) => t.id !== id) }));
    try {
      await apiRequestJson("DELETE", `/api/v1/trips/${id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete";
      set({ trips: previous, error: msg });
    }
  },
  setCurrentTrip: (trip) => set({ currentTrip: trip }),
  updateItineraryDay: (dayIndex, day) =>
    set((state) => {
      if (!state.currentTrip) return state;
      const itinerary = [...state.currentTrip.itinerary];
      itinerary[dayIndex] = day;
      return { currentTrip: { ...state.currentTrip, itinerary } };
    }),
}));
