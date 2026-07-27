// Task 4 — Planner Wizard: 6-step agentic trip planning flow
// Uses wouter (not react-router-dom) for navigation

import { useState } from 'react'
import { useLocation } from 'wouter'
import { tripsApi } from '../../lib/api'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const TRAVEL_STYLES = ['Luxury', 'Adventure', 'Budget', 'Relaxed', 'Cultural', 'Family'] as const
const TRAVEL_MEDIUMS = ['Flight', 'Train', 'RoadTrip'] as const
const INTERESTS = ['History', 'Food', 'Nature', 'Nightlife', 'Shopping', 'Art', 'Sports', 'Wellness'] as const

interface PlannerForm {
    destination: string
    startDate: string
    endDate: string
    totalBudget: number
    currency: string
    travelStyle: typeof TRAVEL_STYLES[number] | ''
    travelMedium: typeof TRAVEL_MEDIUMS[number] | ''
    companions: number
    interests: string[]
}

const inputCls = "w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-[#B3261E] focus:ring-1 focus:ring-[#B3261E]/40 transition-colors text-sm"
const primaryBtn = "py-3 px-6 rounded-xl font-semibold text-sm bg-[#B3261E] hover:bg-[#8C1D17] text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
const secondaryBtn = "px-6 py-3 rounded-xl font-medium text-sm bg-muted text-muted-foreground hover:bg-muted/80 transition-colors border border-border"
const chipBase = "px-4 py-2 rounded-full text-sm font-medium transition-colors border"
const chipActive = `${chipBase} bg-[#B3261E] text-white border-[#B3261E]`
const chipInactive = `${chipBase} bg-muted text-muted-foreground border-border hover:border-[#B3261E]/50`

export function PlannerWizard() {
    const [, navigate] = useLocation()
    const [step, setStep] = useState<Step>(1)
    const [liveSteps, setLiveSteps] = useState<string[]>([])
    const [error, setError] = useState<string | null>(null)
    const [form, setForm] = useState<PlannerForm>({
        destination: '',
        startDate: '',
        endDate: '',
        totalBudget: 1000,
        currency: 'USD',
        travelStyle: '',
        travelMedium: '',
        companions: 1,
        interests: [],
    })

    const update = (field: keyof PlannerForm, value: unknown) =>
        setForm(prev => ({ ...prev, [field]: value }))

    const toggleInterest = (interest: string) =>
        setForm(prev => ({
            ...prev,
            interests: prev.interests.includes(interest)
                ? prev.interests.filter(i => i !== interest)
                : [...prev.interests, interest],
        }))

    const startGeneration = async () => {
        setError(null)
        setStep(5)
        try {
            const result = await tripsApi.generateItinerary({
                destination: form.destination,
                startDate: form.startDate,
                endDate: form.endDate,
                totalBudget: form.totalBudget,
                travelStyle: form.travelStyle as typeof TRAVEL_STYLES[number],
                travelMedium: form.travelMedium as typeof TRAVEL_MEDIUMS[number],
                companions: form.companions,
            })

            const poll = setInterval(async () => {
                try {
                    const status = await tripsApi.getGenerationStatus(result.jobId)
                    setLiveSteps(status.steps)
                    if (status.status === 'done' && status.tripId) {
                        clearInterval(poll)
                        setStep(6)
                        setTimeout(() => navigate(`/app/trips/${status.tripId}`), 1500)
                    }
                    if (status.status === 'failed') {
                        clearInterval(poll)
                        setError(status.error ?? 'Generation failed')
                        setStep(4)
                    }
                } catch {
                    clearInterval(poll)
                    setError('Lost connection to server')
                    setStep(4)
                }
            }, 2000)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to start generation')
            setStep(4)
        }
    }

    const STEPS = [
        { n: 1, label: 'Destination' },
        { n: 2, label: 'Dates' },
        { n: 3, label: 'Budget' },
        { n: 4, label: 'Style' },
    ]

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="w-full max-w-xl bg-card rounded-2xl shadow-2xl p-6 md:p-10 border border-border">
                {/* Step progress — only show for steps 1–4 */}
                {step <= 4 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-between relative">
                            {/* connecting line */}
                            <div className="absolute left-0 right-0 top-4 h-0.5 bg-border -z-0" aria-hidden="true" />
                            <div
                                className="absolute left-0 top-4 h-0.5 bg-[#B3261E] transition-all duration-500 -z-0"
                                style={{ width: `${((step - 1) / 3) * 100}%` }}
                                aria-hidden="true"
                            />
                            {STEPS.map((s) => {
                                const done = step > s.n
                                const active = step === s.n
                                return (
                                    <div key={s.n} className="flex flex-col items-center gap-1.5 z-10">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                                            done ? 'bg-[#B3261E] border-[#B3261E] text-white' :
                                            active ? 'bg-card border-[#B3261E] text-[#B3261E]' :
                                            'bg-card border-border text-muted-foreground'
                                        }`}>
                                            {done ? '✓' : s.n}
                                        </div>
                                        <span className={`text-[10px] font-medium hidden sm:block ${active ? 'text-[#B3261E]' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
                                            {s.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Step 1 — Destination */}
                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">Where are you going?</h2>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">📍</span>
                            <input className={`${inputCls} pl-10`} type="text" value={form.destination} onChange={e => update('destination', e.target.value)} placeholder="e.g. Tokyo, Japan" aria-label="Destination" />
                        </div>
                        <button className={`w-full mt-4 ${primaryBtn}`} onClick={() => setStep(2)} disabled={!form.destination.trim()} aria-label="Continue to dates">Continue →</button>
                    </div>
                )}

                {/* Step 2 — Dates */}
                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {form.destination && (
                            <div className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#B3261E]/10 text-[#B3261E] px-3 py-1 rounded-full border border-[#B3261E]/20">
                                📍 {form.destination}
                            </div>
                        )}
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">When are you traveling?</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-muted-foreground">
                                Start date
                                <input className={`mt-2 ${inputCls}`} type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} aria-label="Start date" />
                            </label>
                            <label className="block text-sm font-medium text-muted-foreground">
                                End date
                                <input className={`mt-2 ${inputCls}`} type="date" value={form.endDate} min={form.startDate} onChange={e => update('endDate', e.target.value)} aria-label="End date" />
                            </label>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button className={secondaryBtn} onClick={() => setStep(1)} aria-label="Back">←</button>
                            <button className={`flex-1 ${primaryBtn}`} onClick={() => setStep(3)} disabled={!form.startDate || !form.endDate} aria-label="Continue to budget">Continue →</button>
                        </div>
                    </div>
                )}

                {/* Step 3 — Budget + Companions */}
                {step === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">Trip Details</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-muted-foreground">
                                Total budget
                                <div className="flex gap-2 mt-2">
                                    <input className={`flex-1 ${inputCls}`} type="number" min={1} value={form.totalBudget} onChange={e => update('totalBudget', Number(e.target.value))} aria-label="Total budget" />
                                    <select className="w-24 bg-muted border border-border rounded-xl px-3 py-3 text-foreground outline-none focus:border-[#B3261E] transition-colors text-sm" value={form.currency} onChange={e => update('currency', e.target.value)} aria-label="Currency">
                                        {['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'].map(c => (<option key={c} value={c}>{c}</option>))}
                                    </select>
                                </div>
                            </label>
                            <label className="block text-sm font-medium text-muted-foreground">
                                Travelers
                                <input className={`mt-2 ${inputCls}`} type="number" min={1} max={20} value={form.companions} onChange={e => update('companions', Number(e.target.value))} aria-label="Number of travelers" />
                            </label>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button className={secondaryBtn} onClick={() => setStep(2)} aria-label="Back">←</button>
                            <button className={`flex-1 ${primaryBtn}`} onClick={() => setStep(4)} disabled={form.totalBudget <= 0} aria-label="Continue to style">Continue →</button>
                        </div>
                    </div>
                )}

                {/* Step 4 — Travel Style + Medium + Interests */}
                {step === 4 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">Your travel style</h2>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-3">Travel style</p>
                            <div className="flex flex-wrap gap-2">
                                {TRAVEL_STYLES.map(style => (<button key={style} className={form.travelStyle === style ? chipActive : chipInactive} onClick={() => update('travelStyle', style)} aria-pressed={form.travelStyle === style}>{style}</button>))}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-3">Getting there</p>
                            <div className="flex flex-wrap gap-2">
                                {TRAVEL_MEDIUMS.map(medium => (<button key={medium} className={form.travelMedium === medium ? chipActive : chipInactive} onClick={() => update('travelMedium', medium)} aria-pressed={form.travelMedium === medium}>{medium}</button>))}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-3">Interests (optional)</p>
                            <div className="flex flex-wrap gap-2">
                                {INTERESTS.map(interest => (<button key={interest} className={form.interests.includes(interest) ? chipActive : chipInactive} onClick={() => toggleInterest(interest)} aria-pressed={form.interests.includes(interest)}>{interest}</button>))}
                            </div>
                        </div>
                        {error && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 p-3 rounded-xl" role="alert">{error}</p>}
                        <div className="flex gap-3 pt-4">
                            <button className={secondaryBtn} onClick={() => setStep(3)} aria-label="Back">←</button>
                            <button className={`flex-1 ${primaryBtn}`} onClick={() => void startGeneration()} disabled={!form.travelStyle || !form.travelMedium} aria-label="Generate my trip">Plan My Trip ✈️</button>
                        </div>
                    </div>
                )}

                {/* Step 5 — Loading */}
                {step === 5 && (
                    <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-500 py-6">
                        <div className="relative w-20 h-20 mx-auto">
                            <div className="w-20 h-20 rounded-full border-4 border-border" />
                            <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-[#B3261E] border-t-transparent animate-spin" aria-hidden="true" />
                            <span className="absolute inset-0 flex items-center justify-center text-2xl">✈️</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Atlas is planning your trip</h2>
                            <p className="text-sm text-muted-foreground mt-1">to {form.destination}</p>
                        </div>
                        <div className="text-left bg-muted rounded-xl p-4 space-y-2 border border-border" aria-live="polite" aria-label="Generation progress">
                            {liveSteps.length === 0 && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse py-1">
                                    <span className="w-4 h-4 rounded-full border-2 border-[#B3261E] border-t-transparent animate-spin shrink-0" />
                                    Starting up...
                                </div>
                            )}
                            {liveSteps.map((s, i) => {
                                const isLast = i === liveSteps.length - 1
                                return (
                                    <div key={i} className={`flex items-center gap-2 text-sm py-1 ${isLast ? 'text-foreground' : 'text-muted-foreground'}`}>
                                        {isLast
                                            ? <span className="w-4 h-4 rounded-full border-2 border-[#B3261E] border-t-transparent animate-spin shrink-0" />
                                            : <span className="w-4 h-4 flex-shrink-0 text-center text-emerald-500 font-bold text-xs leading-4">✓</span>
                                        }
                                        {s}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Step 6 — Done */}
                {step === 6 && (
                    <div className="space-y-4 text-center animate-in fade-in zoom-in-95 duration-500 py-12">
                        <div className="w-20 h-20 mx-auto bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center text-4xl mb-6">✓</div>
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">Your trip is ready!</h2>
                        <p className="text-muted-foreground">Redirecting you to the itinerary...</p>
                    </div>
                )}
            </div>
        </div>
    )
}
