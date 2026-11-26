import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BudgetTracker } from "../../client/src/components/budget/BudgetTracker";

vi.mock("../../client/src/store", () => ({
  useTripStore: { getState: () => ({ fetchTrip: vi.fn() }) },
}));

// Recharts needs real layout; not what this test is about.
vi.mock("recharts", () => {
  const Box = ({ children }: any) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box,
    PieChart: Box,
    Pie: Box,
    Cell: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

const trip = {
  id: "t1",
  origin: "Delhi",
  destination: "Mumbai",
  currency: "INR",
  budget: 60000,
  transitEstimate: 28753,
  itinerary: [],
  expenses: [{ id: "e1", amount: 500, currency: "INR", category: "Food", description: "Lunch" }],
} as any;

function renderTracker(canEdit?: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BudgetTracker trip={trip} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}

describe("BudgetTracker edit controls", () => {
  it("shows the estimate and edit controls to owners and editors", () => {
    renderTracker();
    expect(screen.getByTestId("transit-estimate")).toHaveTextContent("Delhi to Mumbai");
    expect(screen.getByTestId("button-remove-transit")).toBeInTheDocument();
    expect(screen.getByTestId("button-add-expense")).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(3);
  });

  it("hides every edit control from view-only collaborators", () => {
    renderTracker(false);
    expect(screen.getByTestId("transit-estimate")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.queryByTestId("button-remove-transit")).toBeNull();
    expect(screen.queryByTestId("button-add-expense")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
