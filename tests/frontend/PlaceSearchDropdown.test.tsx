import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlaceSearchDropdown, usePlaceSearchKeys } from "@/components/PlaceSearchDropdown";
import type { PlaceSuggestion } from "@/hooks/usePlaceSuggestions";

const suggestions = [
  { id: "1", name: "Hyderabad", display_name: "Hyderabad, Telangana, India" },
  { id: "2", name: "Hyderabad", display_name: "Hyderabad, Sindh, Pakistan" },
] as PlaceSuggestion[];

function Harness({ onSubmit, loading = false }: { onSubmit: () => void; loading?: boolean }) {
  const [value, setValue] = useState("Hyder");
  const [open, setOpen] = useState(true);
  const select = (p: PlaceSuggestion) => {
    setValue(p.display_name ?? "");
    setOpen(false);
  };
  const keys = usePlaceSearchKeys(suggestions, open, select, () => setOpen(false), loading);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="relative">
        <input data-testid="q" value={value} onChange={() => {}} onKeyDown={keys.onKeyDown} />
        <PlaceSearchDropdown
          suggestions={suggestions}
          isLoading={false}
          visible={open}
          activeIndex={keys.activeIndex}
          onSelect={select}
        />
      </div>
    </form>
  );
}

describe("PlaceSearchDropdown keyboard", () => {
  it("Enter picks the first suggestion instead of submitting the form", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    expect(fireEvent.keyDown(screen.getByTestId("q"), { key: "Enter" })).toBe(false);
    expect(screen.getByTestId("q")).toHaveValue("Hyderabad, Telangana, India");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ArrowDown moves the highlight and Enter picks it", () => {
    render(<Harness onSubmit={vi.fn()} />);
    const input = screen.getByTestId("q");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("Hyderabad, Sindh, Pakistan");
  });

  it("clicking a suggestion selects it", () => {
    render(<Harness onSubmit={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(screen.getByTestId("q")).toHaveValue("Hyderabad, Sindh, Pakistan");
  });

  it("Enter while a newer search is loading neither picks a stale suggestion nor submits", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} loading />);
    // false = preventDefault was called, so the browser won't submit the form
    expect(fireEvent.keyDown(screen.getByTestId("q"), { key: "Enter" })).toBe(false);
    expect(screen.getByTestId("q")).toHaveValue("Hyder");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Enter that confirms IME composition is left alone", () => {
    render(<Harness onSubmit={vi.fn()} />);
    fireEvent.keyDown(screen.getByTestId("q"), { key: "Enter", isComposing: true });
    expect(screen.getByTestId("q")).toHaveValue("Hyder");
  });
});
