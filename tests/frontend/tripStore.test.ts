import { describe, it, expect, vi, beforeEach } from "vitest";

// Live-reported: TripDetail.tsx's socket listener calls fetchTrip() on
// every "itinerary-updated" broadcast, and two edits close together
// (two Atlas turns, or simply a slow initial-mount fetch racing a
// faster socket-triggered one) fire two overlapping fetchTrip calls.
// The symptom: after two rapid edits, the itinerary panel showed
// neither — just the pre-session state — because a call that was FIRED
// earlier but RESOLVED later overwrote the fresher data a later call
// had already applied. These tests exercise the sequence-guard fix
// deterministically (mocked, controlled resolution order) rather than
// trying to force a real network race live, which is inherently timing-
// dependent and unreliable to assert on.

const getMock = vi.fn();
vi.mock("../../client/src/lib/api", () => ({
  tripsApi: {
    get: (...args: any[]) => getMock(...args),
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

// Each test needs its own fresh store instance — Zustand's `create` result
// is a singleton across the whole test file if imported once at module
// scope, so re-import inside a beforeEach via vi.resetModules() instead.
async function freshStore() {
  vi.resetModules();
  const mod = await import("../../client/src/store/tripStore");
  return mod.useTripStore;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("tripStore.fetchTrip — out-of-order response guard", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("discards an earlier-fired call's response when it resolves after a later call's", async () => {
    const useTripStore = await freshStore();
    const callA = deferred<any>(); // fired first, resolves LAST (stale)
    const callB = deferred<any>(); // fired second, resolves FIRST (fresh)
    getMock.mockReturnValueOnce(callA.promise).mockReturnValueOnce(callB.promise);

    const pA = useTripStore.getState().fetchTrip("trip-1"); // call A starts
    const pB = useTripStore.getState().fetchTrip("trip-1"); // call B starts (supersedes A)

    // B resolves first — this is the response that should win.
    callB.resolve({ id: "trip-1", destination: "Fresh (from B)" } as any);
    await pB;
    expect(useTripStore.getState().currentTrip?.destination).toBe("Fresh (from B)");

    // A resolves after being superseded — must NOT overwrite B's result.
    callA.resolve({ id: "trip-1", destination: "Stale (from A)" } as any);
    await pA;
    expect(
      useTripStore.getState().currentTrip?.destination,
      "a stale response arriving after a newer one must not win",
    ).toBe("Fresh (from B)");
  });

  it("a stale call's FAILURE does not clobber the fresher successful state either", async () => {
    const useTripStore = await freshStore();
    const callA = deferred<any>();
    const callB = deferred<any>();
    getMock.mockReturnValueOnce(callA.promise).mockReturnValueOnce(callB.promise);

    const pA = useTripStore.getState().fetchTrip("trip-1");
    const pB = useTripStore.getState().fetchTrip("trip-1");

    callB.resolve({ id: "trip-1", destination: "Fresh (from B)" } as any);
    await pB;

    // A (the superseded, earlier call) fails late — should be silently
    // discarded, not turn the already-successful display into an error.
    callA.reject(new Error("stale network error"));
    await pA;
    const state = useTripStore.getState();
    expect(state.currentTrip?.destination).toBe("Fresh (from B)");
    expect(
      state.error,
      "a discarded stale failure must not surface as the current error",
    ).toBeNull();
  });

  it("a single normal fetchTrip call still works (no regression)", async () => {
    const useTripStore = await freshStore();
    getMock.mockResolvedValueOnce({ id: "trip-1", destination: "Solo Call" } as any);

    await useTripStore.getState().fetchTrip("trip-1");
    expect(useTripStore.getState().currentTrip?.destination).toBe("Solo Call");
    expect(useTripStore.getState().isLoading).toBe(false);
  });

  it("three overlapping calls: only the LAST one fired ever wins, regardless of resolution order", async () => {
    const useTripStore = await freshStore();
    const callA = deferred<any>();
    const callB = deferred<any>();
    const callC = deferred<any>();
    getMock
      .mockReturnValueOnce(callA.promise)
      .mockReturnValueOnce(callB.promise)
      .mockReturnValueOnce(callC.promise);

    const pA = useTripStore.getState().fetchTrip("trip-1");
    const pB = useTripStore.getState().fetchTrip("trip-1");
    const pC = useTripStore.getState().fetchTrip("trip-1");

    // Resolve out of order: B, then A, then C (the real winner).
    callB.resolve({ id: "trip-1", destination: "B" } as any);
    await pB;
    callA.resolve({ id: "trip-1", destination: "A" } as any);
    await pA;
    expect(
      useTripStore.getState().currentTrip?.destination,
      "neither stale call should win",
    ).not.toBe("A");

    callC.resolve({ id: "trip-1", destination: "C (latest)" } as any);
    await pC;
    expect(useTripStore.getState().currentTrip?.destination).toBe("C (latest)");
  });
});
