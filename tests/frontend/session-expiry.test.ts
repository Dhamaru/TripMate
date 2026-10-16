import { describe, it, expect, vi, afterEach } from "vitest";
import { apiRequest } from "@/lib/queryClient";
import { useAuthStore } from "@/store/authStore";

const respond = (status: number, url: string) =>
  vi.fn(async () => {
    const r = new Response("{}", { status });
    Object.defineProperty(r, "url", { value: url });
    return r;
  });

describe("mid-session 401", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the auth store to re-verify once, ignoring auth endpoints", async () => {
    const check = vi.fn(async () => {});
    useAuthStore.setState({ isAuthenticated: true, checkSession: check });

    vi.stubGlobal("fetch", respond(401, "http://localhost/api/v1/auth/profile"));
    await apiRequest("GET", "/api/v1/auth/profile");
    expect(check).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", respond(401, "http://localhost/api/v1/trips"));
    await apiRequest("GET", "/api/v1/trips");
    await apiRequest("GET", "/api/v1/trips"); // debounced
    expect(check).toHaveBeenCalledTimes(1);
  });
});
