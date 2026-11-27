import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownContent } from "../../components/agent/MarkdownContent";

describe("MarkdownContent", () => {
  it("renders emphasis, headings and bullets without literal Markdown markers", () => {
    const { container } = render(
      <MarkdownContent content={"### Tip\n**Daytime:** warm\n- Pack water"} />,
    );
    expect(screen.getByText("Tip").className).toContain("font-semibold");
    expect(screen.getByText("Daytime:").tagName).toBe("STRONG");
    expect(screen.getAllByText("•")).toHaveLength(1);
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("###");
  });

  it("does not interpret model output as HTML", () => {
    const { container } = render(<MarkdownContent content={'<img src=x onerror="alert(1)">'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img");
  });
});
