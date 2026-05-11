// Task 7 — AI reasoning panel (collapsible)

import { useState } from 'react'

interface Props {
    reasoning: string
    dayIndex: number
    confidence: 'High' | 'Medium' | 'Low'
}

export function AIReasoningPanel({ reasoning, dayIndex }: Props) {
    const [isExpanded, setIsExpanded] = useState(false)

    return (
        <div className="bg-muted/50 rounded-lg border border-border overflow-hidden">
            <button
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsExpanded(prev => !prev)}
                aria-expanded={isExpanded}
                aria-controls={`reasoning-${dayIndex}`}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} AI reasoning for day ${dayIndex + 1}`}
            >
                <div className="flex items-center gap-2">
                    <span aria-hidden="true">🤖</span>
                    <span>AI Reasoning</span>
                </div>
                <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
            </button>
            {isExpanded && (
                <div id={`reasoning-${dayIndex}`} className="px-4 pb-4 pt-1 animate-in slide-in-from-top-2 duration-300" role="region" aria-label={`AI reasoning for day ${dayIndex + 1}`}>
                    <p className="text-sm text-muted-foreground leading-relaxed italic border-l-2 border-[#F59E0B]/40 pl-3">{reasoning}</p>
                </div>
            )}
        </div>
    )
}
