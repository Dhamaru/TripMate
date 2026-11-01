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
});
