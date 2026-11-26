import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "@/store/authStore";
import { queryClient } from "@/lib/queryClient";

// The next person on a shared device must not see the previous user's data.
describe("sign-out clears cached user data", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
  });

  it("empties the query cache and the service worker's trips cache", async () => {
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: del });
    queryClient.setQueryData(["/api/v1/trips"], [{ id: "secret" }]);
    await useAuthStore.getState().signOut();
    expect(queryClient.getQueryData(["/api/v1/trips"])).toBeUndefined();
    expect(del).toHaveBeenCalledWith("trips-api-cache");
  });

  it("still clears everything when the sign-out request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: del });
    queryClient.setQueryData(["/api/v1/trips"], [{ id: "secret" }]);
    await useAuthStore
      .getState()
      .signOut()
      .catch(() => {});
    expect(queryClient.getQueryData(["/api/v1/trips"])).toBeUndefined();
    expect(del).toHaveBeenCalledWith("trips-api-cache");
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe("offline cold start", () => {
  it("keeps the last signed-in user when the device is offline", async () => {
    useAuthStore.setState({ user: { id: "u1", firstName: "Qa" } as any, isAuthenticated: true });
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
    useAuthStore.setState({ user: { id: "u1", firstName: "Qa" } as any });
    useAuthStore.setState({ isAuthenticated: false, isLoading: true });
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await useAuthStore.getState().checkSession();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe("u1");
    online.mockRestore();
  });
});
