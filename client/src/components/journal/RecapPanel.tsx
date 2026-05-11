// Task 15 — Recap panel component

import { useState, useMemo } from 'react'
import { journalApi } from '../../lib/api'
import { RecapCard } from './RecapCard'
import { Alert, AlertDescription } from '../ui/alert'
import { Sparkles } from 'lucide-react'

interface Props {
    tripId: string;
    destination: string;
    entryCount: number;
    onRecapSaved: () => void;
    recapJournalEntry?: any; // New: Pass existing recap if found
}

type State = 'idle' | 'loading' | 'done' | 'error'
const MIN_ENTRIES = 3

export function RecapPanel({ tripId, destination, entryCount, onRecapSaved, recapJournalEntry }: Props) {
    const [state, setState] = useState<State>(recapJournalEntry ? 'done' : 'idle')
    const [error, setError] = useState<string | null>(null)

    const canGenerate = entryCount >= MIN_ENTRIES

    const recap = useMemo(() => {
        return recapJournalEntry?.recapMeta || null;
    }, [recapJournalEntry]);

    const handleGenerate = async () => {
        setState('loading')
        setError(null)
        try {
            await journalApi.generateRecap(tripId)
            setState('done')
            onRecapSaved()
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to generate recap')
            setState('error')
        }
    }

    if (!canGenerate) return null

    return (
        <div className="recap-panel space-y-4">
            {state === 'idle' && (
                <button
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all font-bold text-sm border border-primary/20"
                    onClick={() => void handleGenerate()}
                    aria-label="Generate AI trip recap from journal entries"
                >
                    <Sparkles className="h-4 w-4" /> Generate Trip Recap
                </button>
            )}
            
            {state === 'loading' && (
                <div className="flex items-center gap-2 text-primary animate-pulse py-2">
                    <Sparkles className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-bold tracking-tight">Atlas is crafting your journey story...</span>
                </div>
            )}

            {state === 'done' && recap && (
                <div className="mt-6">
                    <RecapCard recap={recap} destination={destination} />
                </div>
            )}

            {state === 'done' && !recap && (
                 <p className="recap-panel__success" role="status">✅ Recap saved to your journal</p>
            )}

            {state === 'error' && (
                <Alert variant="destructive">
                    <AlertDescription className="flex items-center justify-between">
                        <span>{error}</span>
                        <button className="underline font-bold" onClick={() => void handleGenerate()}>
                            Retry
                        </button>
                    </AlertDescription>
                </Alert>
            )}
        </div>
    )
}
