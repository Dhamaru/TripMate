// AI plan confidence — rendered as a visa-style stamp (see DESIGN.md: any
// status indicator is a bordered, rotated stamp, never a flat rounded pill).

interface Props {
  confidence: "High" | "Medium" | "Low";
}

const CONFIDENCE_CONFIG = {
  High: { color: "var(--transit-green)", label: "High confidence" },
  Medium: { color: "var(--warning-amber)", label: "Medium confidence" },
  Low: { color: "var(--stamp-red)", label: "Low confidence" },
} as const;

export function ModelConfidenceBadge({ confidence }: Props) {
  const cfg = CONFIDENCE_CONFIG[confidence];
  return (
    <span
      className="stamp text-[10px]"
      style={{ color: cfg.color }}
      aria-label={`AI confidence: ${cfg.label}`}
      title={cfg.label}
    >
      {confidence} confidence
    </span>
  );
}
