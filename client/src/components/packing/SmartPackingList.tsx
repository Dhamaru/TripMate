// Task 12 — SmartPackingList component
import { useState } from 'react'
import { usePackingStore } from '../../store/packingStore'
import type { PackingItem } from '../../types/api.types'

interface Props { tripId: string }

export function SmartPackingList({ tripId }: Props) {
    const { packingList, isGenerating, generateList, toggleItem, addItem } = usePackingStore()
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
    const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)

    const checkedCount = packingList?.categories
        .flatMap(c => c.items)
        .filter(i => i.checked).length ?? 0
    const totalItems = packingList?.totalItems ?? 0

    const toggleCategory = (name: string) =>
        setExpandedCategories(prev => {
            const next = new Set(prev)
            next.has(name) ? next.delete(name) : next.add(name)
            return next
        })

    const handleGenerate = async () => {
        setError(null)
        try { await generateList(tripId) }
        catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to generate') }
    }

    const handleToggle = async (item: PackingItem) => {
        if (!packingList) return
        try { await toggleItem(packingList.id, item.id) }
        catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to update') }
    }

    const handleAddItem = async (categoryName: string) => {
        const name = newItemInputs[categoryName]?.trim()
        if (!name || !packingList) return
        try {
            await addItem(packingList.id, { name, quantity: 1, category: categoryName, essential: false })
            setNewItemInputs(prev => ({ ...prev, [categoryName]: '' }))
        } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to add item') }
    }

    if (!packingList) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-[#1E1E1E] rounded-2xl border border-white/5 shadow-xl">
                <p className="text-gray-400 mb-6">No packing list yet.</p>
                <button
                    className="py-3 px-6 rounded-xl font-medium text-sm bg-[#B3261E] hover:bg-[#8C1D17] text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                    onClick={() => void handleGenerate()}
                    disabled={isGenerating}
                    aria-label="Generate smart packing list"
                >
                    {isGenerating ? (
                        <><span className="w-4 h-4 rounded-full border-2 border-gray-900 border-t-transparent animate-spin" /> Generating...</>
                    ) : '🧳 Generate Packing List'}
                </button>
                {error && <p className="mt-4 text-sm text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 rounded-xl" role="alert">{error}</p>}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {packingList.weatherNote && (
                <div className="flex gap-3 p-4 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 items-start" role="note">
                    <span aria-hidden="true" className="text-lg">🌤</span>
                    <p className="leading-relaxed">{packingList.weatherNote}</p>
                </div>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-[#1E1E1E] rounded-2xl border border-white/5 shadow-xl mb-6">
                <div className="flex-1 w-full sm:w-auto">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                        <span className="font-medium">Packing Progress</span>
                        <span>{checkedCount} / {totalItems} packed</span>
                    </div>
                    <div
                        className="h-2 bg-black/40 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={checkedCount}
                        aria-valuemin={0}
                        aria-valuemax={totalItems}
                        aria-label={`${checkedCount} of ${totalItems} items packed`}
                    >
                        <div
                            className="h-full bg-[#B3261E] transition-all duration-500 ease-out"
                            style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }}
                        />
                    </div>
                </div>
                <button
                    className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm bg-white/5 text-gray-300 hover:bg-white/10 transition-colors flex items-center justify-center gap-2 shrink-0"
                    onClick={() => void handleGenerate()}
                    disabled={isGenerating}
                    aria-label="Regenerate packing list"
                >
                    {isGenerating ? <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" /> : '↺ Regenerate'}
                </button>
            </div>

            {error && <p className="text-sm text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 rounded-xl" role="alert">{error}</p>}

            <div className="space-y-4">
                {packingList.categories.map(category => (
                    <div key={category.name} className="bg-[#1E1E1E] rounded-2xl border border-white/5 overflow-hidden shadow-xl">
                        <button
                            className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
                            onClick={() => toggleCategory(category.name)}
                            aria-expanded={expandedCategories.has(category.name)}
                            aria-controls={`category-${category.name}`}
                            aria-label={`${category.name} — ${category.items.filter(i => i.checked).length} of ${category.items.length} packed`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl" aria-hidden="true">{category.icon}</span>
                                <span className="font-medium text-white">{category.name}</span>
                                <span className="text-xs text-gray-400 bg-black/20 px-2 py-0.5 rounded-full">
                                    {category.items.filter(i => i.checked).length}/{category.items.length}
                                </span>
                            </div>
                            <span className={`text-gray-500 transition-transform duration-200 ${expandedCategories.has(category.name) ? 'rotate-180' : ''}`} aria-hidden="true">
                                ▾
                            </span>
                        </button>

                        {expandedCategories.has(category.name) && (
                            <div id={`category-${category.name}`} className="animate-in slide-in-from-top-2 duration-300">
                                {category.items.map(item => (
                                    <div
                                        key={item.id}
                                        className={item.checked ? "flex items-center gap-3 p-3 sm:p-4 border-b border-white/5 last:border-0 bg-white/5 opacity-75 group" : "flex items-center gap-3 p-3 sm:p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group"}
                                    >
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded border-border text-[#B3261E] focus:ring-[#B3261E] bg-transparent cursor-pointer"
                                            checked={item.checked}
                                            onChange={() => void handleToggle(item)}
                                            aria-label={`${item.checked ? 'Unpack' : 'Pack'} ${item.name}`}
                                        />
                                        <span className={`flex-1 text-sm ${item.checked ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                                            {item.name}
                                        </span>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {item.quantity > 1 && (
                                                <span className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded" aria-label={`Quantity: ${item.quantity}`}>
                                                    ×{item.quantity}
                                                </span>
                                            )}
                                            {item.essential && (
                                                <span className="text-[#B3261E]" aria-label="Essential item">★</span>
                                            )}
                                            {item.note && (
                                                <span className="text-gray-500 cursor-help" title={item.note}>ℹ</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div className="flex items-center gap-2 p-3 sm:p-4 bg-black/20">
                                    <input
                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:border-[#06e0f9] focus:ring-1 focus:ring-[#06e0f9]/50 transition-colors text-sm"
                                        type="text"
                                        placeholder="Add item..."
                                        value={newItemInputs[category.name] ?? ''}
                                        onChange={e => setNewItemInputs(prev => ({ ...prev, [category.name]: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && void handleAddItem(category.name)}
                                        aria-label={`Add item to ${category.name}`}
                                    />
                                    <button
                                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
                                        onClick={() => void handleAddItem(category.name)}
                                        aria-label={`Add item to ${category.name}`}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
