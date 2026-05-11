// Task 15 — Enhance entry flow component

import { useState } from 'react'
import { journalApi } from '../../lib/api'

interface Props {
    entryId: string
    onAccepted: (newText: string) => void
}

type State = 'idle' | 'loading' | 'reviewing' | 'saving'

export function EnhanceEntryFlow({ entryId, onAccepted }: Props) {
    const [state, setState] = useState<State>('idle')
    const [result, setResult] = useState<{
        enhanced: string
        changesSummary: string
        original: string
    } | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleEnhance = async () => {
        setState('loading')
        setError(null)
        try {
            const data = await journalApi.enhance(entryId)
            setResult(data as { enhanced: string; changesSummary: string; original: string })
            setState('reviewing')
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Enhancement failed')
            setState('idle')
        }
    }

    const handleAccept = async () => {
        if (!result) return
        setState('saving')
        try {
            await journalApi.confirmEnhancement(entryId, result.enhanced)
            onAccepted(result.enhanced)
            setState('idle')
            setResult(null)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to save')
            setState('reviewing')
        }
    }

    const handleDiscard = () => {
        setState('idle')
        setResult(null)
        setError(null)
    }

    return (
        <div className="enhance-flow">
            {state === 'idle' && (
                <button
                    className="enhance-flow__trigger"
                    onClick={() => void handleEnhance()}
                    aria-label="Enhance journal entry with AI"
                >
                    ✨ Enhance
                </button>
            )}

            {state === 'loading' && (
                <span className="enhance-flow__loading" aria-live="polite">✨ Enhancing...</span>
            )}

            {state === 'reviewing' && result && (
                <div className="enhance-flow__review" role="region" aria-label="Review enhancement">
                    <p className="enhance-flow__summary">📝 {result.changesSummary}</p>
                    <div className="enhance-flow__diff">
                        <div className="enhance-flow__original">
                            <h4 className="enhance-flow__label">Original</h4>
                            <p className="enhance-flow__text">{result.original}</p>
                        </div>
                        <div className="enhance-flow__enhanced">
                            <h4 className="enhance-flow__label">Enhanced</h4>
                            <p className="enhance-flow__text">{result.enhanced}</p>
                        </div>
                    </div>
                    <div className="enhance-flow__actions">
                        <button
                            className="enhance-flow__accept-btn"
                            onClick={() => void handleAccept()}
                            aria-label="Accept enhanced version"
                        >
                            ✓ Accept
                        </button>
                        <button
                            className="enhance-flow__discard-btn"
                            onClick={handleDiscard}
                            aria-label="Discard enhancement"
                        >
                            ✕ Discard
                        </button>
                    </div>
                    {error && <p className="enhance-flow__error" role="alert">{error}</p>}
                </div>
            )}

            {state === 'saving' && (
                <span className="enhance-flow__loading" aria-live="polite">⏳ Saving...</span>
            )}
        </div>
    )
}
