import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../../client/src/pages/Home";
import { useAuthStore, useTripStore } from "../../client/src/store";

// The dashboard page is Home.tsx now (Dashboard.tsx no longer exists).
// It uses wouter, not react-router-dom (never a dependency here), and
// wouter's useLocation/Link work standalone without a Provider wrapper.

vi.mock("../../client/src/store", () => ({
  useAuthStore: vi.fn(),
  useTripStore: vi.fn(),
  // Home.tsx's "Ask Atlas anything" spotlight card selects toggleChat via
  // useAgentStore((s) => s.toggleChat) — the mock just needs to exist and
  // be callable with a selector; neither test here clicks the card.
  useAgentStore: vi.fn((selector: (state: { toggleChat: () => void }) => unknown) =>
    selector({ toggleChat: vi.fn() }),
  ),
}));

describe("Home (Dashboard) Page", () => {
  beforeEach(() => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { firstName: "Dhamaru", lastName: "K", email: "kasivasi2005@gmail.com" },
    } as unknown as ReturnType<typeof useAuthStore>);
    vi.mocked(useTripStore).mockReturnValue({
      trips: [],
      isLoading: false,
      error: null,
      fetchTrips: vi.fn(),
    } as unknown as ReturnType<typeof useTripStore>);
  });

  it("should greet the user by first name", () => {
    render(<Home />);
    expect(screen.getByText("Dhamaru")).toBeInTheDocument();
  });

  it("should show a call to action to plan a new trip when there are no trips", () => {
    render(<Home />);
    expect(screen.getByText(/Start planning/i)).toBeInTheDocument();
  });
});
