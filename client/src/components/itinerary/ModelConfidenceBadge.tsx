// Task 6 — Model confidence badge

interface Props {
    confidence: 'High' | 'Medium' | 'Low'
}

const CONFIDENCE_CONFIG = {
    High: { icon: '🟢', label: 'High confidence', className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-400 border border-green-500/20' },
    Medium: { icon: '🟡', label: 'Medium confidence', className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' },
    Low: { icon: '🔴', label: 'Low confidence', className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-400 border border-red-500/20' },
} as const

export function ModelConfidenceBadge({ confidence }: Props) {
    const cfg = CONFIDENCE_CONFIG[confidence]
    return (
        <span
            className={cfg.className}
            aria-label={`AI confidence: ${cfg.label}`}
            title={cfg.label}
        >
            {cfg.icon} {confidence}
        </span>
    )
}
