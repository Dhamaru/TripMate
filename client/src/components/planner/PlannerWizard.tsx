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
                        setTimeout(() => navigate(`/app/trip/${status.tripId}`), 1500)
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

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f2123]">
            <div className="w-full max-w-lg bg-[#1E1E1E] rounded-2xl shadow-2xl p-6 md:p-8">
                {/* Progress Dots */}
                <div className="flex justify-center gap-2 mb-6" aria-hidden="true">
                    {[1, 2, 3, 4, 5, 6].map((s) => (
                        <div
                            key={s}
                            className={`w-2 h-2 rounded-full ${s === step ? 'bg-[#06e0f9]' : 'bg-white/20'}`}
                        />
                    ))}
                </div>

                {/* Step 1 — Destination */}
                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-2xl font-bold text-white tracking-tight">Where are you going?</h2>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">📍</span>
                            <input
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#06e0f9] focus:ring-1 focus:ring-[#06e0f9]/50 transition-colors text-sm"
                                type="text"
                                value={form.destination}
                                onChange={e => update('destination', e.target.value)}
                                placeholder="e.g. Tokyo, Japan"
                                aria-label="Destination"
                            />
                        </div>
                        <button
                            className="w-full py-3 px-6 rounded-xl font-medium text-sm bg-[#06e0f9] hover:bg-[#06e0f9]/90 text-gray-900 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 mt-4"
                            onClick={() => setStep(2)}
                            disabled={!form.destination.trim()}
                            aria-label="Continue to dates"
                        >
                            Continue →
                        </button>
                    </div>
                )}

                {/* Step 2 — Dates */}
                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-2xl font-bold text-white tracking-tight">When are you traveling?</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-300">
                                Start date
                                <input
                                    className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#06e0f9] focus:ring-1 focus:ring-[#06e0f9]/50 transition-colors text-sm"
                                    type="date"
                                    value={form.startDate}
                                    onChange={e => update('startDate', e.target.value)}
                                    aria-label="Start date"
                                />
                            </label>
                            <label className="block text-sm font-medium text-gray-300">
                                End date
                                <input
                                    className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#06e0f9] focus:ring-1 focus:ring-[#06e0f9]/50 transition-colors text-sm"
                                    type="date"
                                    value={form.endDate}
                                    min={form.startDate}
                                    onChange={e => update('endDate', e.target.value)}
                                    aria-label="End date"
                                />
                            </label>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button className="px-6 py-3 rounded-xl font-medium text-sm bg-white/5 text-gray-300 hover:bg-white/10 transition-colors" onClick={() => setStep(1)} aria-label="Back">←</button>
                            <button
                                className="flex-1 py-3 px-6 rounded-xl font-medium text-sm bg-[#06e0f9] hover:bg-[#06e0f9]/90 text-gray-900 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                onClick={() => setStep(3)}
                                disabled={!form.startDate || !form.endDate}
                                aria-label="Continue to budget"
                            >
                                Continue →
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3 — Budget + Companions */}
                {step === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-2xl font-bold text-white tracking-tight">Trip Details</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-300">
                                Total budget
                                <div className="flex gap-2 mt-2">
                                    <input
                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#06e0f9] focus:ring-1 focus:ring-[#06e0f9]/50 transition-colors text-sm"
                                        type="number"
                                        min={1}
                                        value={form.totalBudget}
                                        onChange={e => update('totalBudget', Number(e.target.value))}
                                        aria-label="Total budget"
                                    />
                                    <select
                                        className="w-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-[#06e0f9] focus:ring-1 focus:ring-[#06e0f9]/50 transition-colors text-sm"
                                        value={form.currency}
                                        onChange={e => update('currency', e.target.value)}
                                        aria-label="Currency"
                                    >
                                        {['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'].map(c => (
                                            <option key={c} value={c} className="bg-[#1E1E1E]">{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </label>
                            <label className="block text-sm font-medium text-gray-300">
                                Travelers
                                <input
                                    className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#06e0f9] focus:ring-1 focus:ring-[#06e0f9]/50 transition-colors text-sm"
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={form.companions}
                                    onChange={e => update('companions', Number(e.target.value))}
                                    aria-label="Number of travelers"
                                />
                            </label>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button className="px-6 py-3 rounded-xl font-medium text-sm bg-white/5 text-gray-300 hover:bg-white/10 transition-colors" onClick={() => setStep(2)} aria-label="Back">←</button>
                            <button
                                className="flex-1 py-3 px-6 rounded-xl font-medium text-sm bg-[#06e0f9] hover:bg-[#06e0f9]/90 text-gray-900 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                onClick={() => setStep(4)}
                                disabled={form.totalBudget <= 0}
                                aria-label="Continue to style"
                            >
                                Continue →
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 4 — Travel Style + Medium + Interests */}
                {step === 4 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-2xl font-bold text-white tracking-tight">Your travel style</h2>

                        <div>
                            <p className="text-sm font-medium text-gray-400 mb-3">Travel style</p>
                            <div className="flex flex-wrap gap-2">
                                {TRAVEL_STYLES.map(style => (
                                    <button
                                        key={style}
                                        className={form.travelStyle === style
                                            ? "px-4 py-2 rounded-full text-sm font-medium transition-colors bg-[#06e0f9] text-gray-900 border border-[#06e0f9]"
                                            : "px-4 py-2 rounded-full text-sm font-medium transition-colors bg-white/5 text-gray-300 border border-white/10 hover:border-[#06e0f9]/50"}
                                        onClick={() => update('travelStyle', style)}
                                        aria-label={`Travel style: ${style}`}
                                        aria-pressed={form.travelStyle === style}
                                    >
                                        {style}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-medium text-gray-400 mb-3">Getting there</p>
                            <div className="flex flex-wrap gap-2">
                                {TRAVEL_MEDIUMS.map(medium => (
                                    <button
                                        key={medium}
                                        className={form.travelMedium === medium
                                            ? "px-4 py-2 rounded-full text-sm font-medium transition-colors bg-[#06e0f9] text-gray-900 border border-[#06e0f9]"
                                            : "px-4 py-2 rounded-full text-sm font-medium transition-colors bg-white/5 text-gray-300 border border-white/10 hover:border-[#06e0f9]/50"}
                                        onClick={() => update('travelMedium', medium)}
                                        aria-label={`Travel medium: ${medium}`}
                                        aria-pressed={form.travelMedium === medium}
                                    >
                                        {medium}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-medium text-gray-400 mb-3">Interests (optional)</p>
                            <div className="flex flex-wrap gap-2">
                                {INTERESTS.map(interest => (
                                    <button
                                        key={interest}
                                        className={form.interests.includes(interest)
                                            ? "px-4 py-2 rounded-full text-sm font-medium transition-colors bg-[#06e0f9] text-gray-900 border border-[#06e0f9]"
                                            : "px-4 py-2 rounded-full text-sm font-medium transition-colors bg-white/5 text-gray-300 border border-white/10 hover:border-[#06e0f9]/50"}
                                        onClick={() => toggleInterest(interest)}
                                        aria-label={`Interest: ${interest}`}
                                        aria-pressed={form.interests.includes(interest)}
                                    >
                                        {interest}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && <p className="text-sm text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 rounded-xl" role="alert">{error}</p>}

                        <div className="flex gap-3 pt-4">
                            <button className="px-6 py-3 rounded-xl font-medium text-sm bg-white/5 text-gray-300 hover:bg-white/10 transition-colors" onClick={() => setStep(3)} aria-label="Back">←</button>
                            <button
                                className="flex-1 py-3 px-6 rounded-xl font-medium text-sm bg-[#06e0f9] hover:bg-[#06e0f9]/90 text-gray-900 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                onClick={() => void startGeneration()}
                                disabled={!form.travelStyle || !form.travelMedium}
                                aria-label="Generate my trip"
                            >
                                Plan My Trip ✈️
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 5 — Loading / Live steps */}
                {step === 5 && (
                    <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-500 py-8">
                        <div className="w-16 h-16 mx-auto rounded-full border-4 border-[#06e0f9] border-t-transparent animate-spin" aria-hidden="true" />
                        <h2 className="text-xl font-bold text-white tracking-tight">Atlas is planning your trip...</h2>

                        <div className="text-left bg-white/5 rounded-xl p-4 mt-8 space-y-2 border border-white/5" aria-live="polite" aria-label="Generation progress">
                            {liveSteps.length === 0 && (
                                <div className="flex items-center gap-2 text-sm text-gray-200 animate-pulse py-1">
                                    <span aria-hidden="true">🤔</span> Starting up...
                                </div>
                            )}
                            {liveSteps.map((s, i) => {
                                const isLast = i === liveSteps.length - 1;
                                return (
                                    <div key={i} className={`flex items-center gap-2 text-sm py-1 ${isLast ? 'text-gray-200 animate-pulse' : 'text-gray-400'}`}>
                                        {isLast ? <span className="w-4 h-4 rounded-full border-2 border-[#06e0f9] border-t-transparent animate-spin shrink-0" /> : <span className="text-[#10B981] shrink-0">✓</span>}
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
                        <div className="w-20 h-20 mx-auto bg-[#10B981]/20 text-[#10B981] rounded-full flex items-center justify-center text-4xl mb-6">
                            ✓
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Your trip is ready!</h2>
                        <p className="text-gray-400">Redirecting you to the itinerary...</p>
                    </div>
                )}
            </div>
        </div>
    )
}
