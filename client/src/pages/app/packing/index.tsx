import { SortablePackingItem } from "@/components/SortablePackingItem";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
    Plus,
    Trash2,
    GripVertical,
    AlertCircle,
    CheckCircle2,
    ArrowLeft,
    Sun,
    Snowflake,
    CloudRain,
    Leaf,
    Search,
    Copy,
    Printer,
    Filter,
    ChevronDown,
    ChevronRight,
    Save,
    MapPin,
    FolderOpen,
    Loader2,
    ClipboardCopy,
    ClipboardPaste,
    Lightbulb
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { IPackingListItem, PackingList, Trip } from "@shared/schema";
import { AnimatePresence, motion } from "framer-motion";

type PackingItem = IPackingListItem & { is_mandatory?: boolean; category?: string };

// Every model's toJSON (shared/schema.ts baseToJSON) rewrites _id -> id, so
// API responses never actually carry `_id` — only the raw Mongoose document
// does, before serialization. Reading `._id` directly on anything that came
// back from a fetch always silently returns undefined. Use this everywhere
// an id is read off an API response (trips, packing lists, templates).
function getId(obj: any): string {
    return String(obj?._id || obj?.id || '');
}


const SEASONS = ["Summer", "Winter", "Spring", "Autumn"] as const;
type Season = typeof SEASONS[number];

const MANDATORY_ITEMS = [
    { name: "Aadhaar Card", is_mandatory: true },
    { name: "Passport", is_mandatory: true },
    { name: "Driving Licence", is_mandatory: true },
    { name: "Voter ID", is_mandatory: true },
    { name: "PAN Card", is_mandatory: true },
    { name: "Travel Insurance (Policy + Number)", is_mandatory: true },
    { name: "COVID / Vaccination Certificate", is_mandatory: true },
    { name: "Country-specific Visas", is_mandatory: true },
];

const SEASONAL_DEFAULTS: Record<Season, { name: string; category: string }[]> = {
    Summer: [
        { name: "Sunscreen", category: "Toiletries" },
        { name: "Sunglasses", category: "Accessories" },
        { name: "Hat / Cap", category: "Accessories" },
        { name: "Swimwear", category: "Clothing" },
        { name: "Light Cotton Clothes", category: "Clothing" },
        { name: "Sandals / Flip-flops", category: "Footwear" },
        { name: "Water Bottle", category: "Misc" },
        { name: "Insect Repellent", category: "Toiletries" },
    ],
    Winter: [
        { name: "Thermal Wear", category: "Clothing" },
        { name: "Heavy Jacket / Coat", category: "Clothing" },
        { name: "Gloves & Scarf", category: "Accessories" },
        { name: "Woolen Socks", category: "Clothing" },
        { name: "Moisturizer / Lip Balm", category: "Toiletries" },
        { name: "Boots", category: "Footwear" },
        { name: "Hand Warmers", category: "Misc" },
    ],
    Spring: [
        { name: "Light Jacket", category: "Clothing" },
        { name: "Umbrella / Raincoat", category: "Misc" },
        { name: "Comfortable Walking Shoes", category: "Footwear" },
        { name: "Allergy Medicine", category: "Meds" },
        { name: "Layered Clothing", category: "Clothing" },
    ],
    Autumn: [
        { name: "Light Sweater / Cardigan", category: "Clothing" },
        { name: "Windbreaker", category: "Clothing" },
        { name: "Boots / Closed Shoes", category: "Footwear" },
        { name: "Lip Balm", category: "Toiletries" },
        { name: "Scarf", category: "Accessories" },
    ],
};

export default function PackingChecklist() {
    const [, navigate] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeSeason, setActiveSeason] = useState<Season>("Summer");
    const [newItemName, setNewItemName] = useState("");

    // New Features State
    const [searchTerm, setSearchTerm] = useState("");
    const [filterBy, setFilterBy] = useState<"all" | "packed" | "unpacked">("all");
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [selectedTripId, setSelectedTripId] = useState<string>("none");
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [templateName, setTemplateName] = useState("");
    const [templateToLoad, setTemplateToLoad] = useState<any>(null);

    const { data: userTrips } = useQuery<Trip[]>({
        queryKey: ["/api/v1/trips?light=true"],
    });

    // Deep-linked from a trip's own page (?tripId=...) — pre-select it
    // instead of leaving the user to hunt for it in the dropdown.
    useEffect(() => {
        const tripId = new URLSearchParams(window.location.search).get("tripId");
        if (tripId && userTrips?.some(t => getId(t) === tripId)) {
            setSelectedTripId(tripId);
        }
    }, [userTrips]);

    const { data: templates } = useQuery<any[]>({
        queryKey: ["/api/v1/packing-lists/templates"],
    });

    const { data: packingLists, isLoading } = useQuery<PackingList[]>({
        queryKey: ["/api/v1/packing-lists"],
    });

    const currentList = packingLists?.find((list) => {
        if (selectedTripId !== "none") {
            return String(list.tripId) === selectedTripId;
        }
        // For general list (no trip selected), exclude lists that belong to a trip
        return (list.season === activeSeason || list.name.includes(activeSeason)) && !list.tripId;
    });

    const [localItems, setLocalItems] = useState<PackingItem[]>([]);
    const [isDirty, setIsDirty] = useState(false);

    // Sync local state with server state when switching lists/seasons
    useEffect(() => {
        if (currentList) {
            setLocalItems(currentList.items);
        } else if (!isLoading) {
            // Load defaults if no list exists
            const defaults = [
                ...MANDATORY_ITEMS.map(i => ({ ...i, quantity: 1, packed: false, category: "Documents", is_mandatory: true })),
                ...SEASONAL_DEFAULTS[activeSeason].map(i => ({ ...i, quantity: 1, packed: false })),
            ];
            setLocalItems(defaults as PackingItem[]);
        }
        setIsDirty(false);
    }, [currentList, activeSeason, isLoading, selectedTripId]);

    // Debounced Save
    useEffect(() => {
        if (!isDirty) return;

        const timer = setTimeout(() => {
            handleSave(localItems);
            setIsDirty(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, [localItems, isDirty]);

    const items = localItems;

    const createListMutation = useMutation({
        mutationFn: async (newItems: IPackingListItem[]) => {
            const tripId = selectedTripId !== "none" ? selectedTripId : undefined;
            const tripName = tripId
                ? userTrips?.find(t => getId(t) === tripId)?.destination || "Trip"
                : activeSeason;

            const res = await apiRequest("POST", "/api/v1/packing-lists", {
                name: `${tripName} Packing List`,
                season: activeSeason,
                tripId: tripId,
                items: newItems,
            });
            return res.json();
        },
        onMutate: async (newItems) => {
            await queryClient.cancelQueries({ queryKey: ["/api/v1/packing-lists"] });
            const previousLists = queryClient.getQueryData<PackingList[]>(["/api/v1/packing-lists"]);
            const tripId = selectedTripId !== "none" ? selectedTripId : undefined;
            const tripName = tripId
                ? userTrips?.find(t => getId(t) === tripId)?.destination || "Trip"
                : activeSeason;

            const optimisticList: PackingList = {
                _id: "optimistic-" + Date.now(),
                name: `${tripName} Packing List`,
                season: activeSeason,
                tripId: tripId as any,
                items: newItems,
                userId: "current-user",
                createdAt: new Date(),
                updatedAt: new Date(),
            } as PackingList;
            queryClient.setQueryData<PackingList[]>(["/api/v1/packing-lists"], (old) => old ? [...old, optimisticList] : [optimisticList]);
            return { previousLists };
        },
        onSuccess: () => {
            toast({ title: "List Saved", description: "Your packing list has been saved successfully.", className: "bg-green-600 text-white border-none" });
        },
        onError: (err, newItems, context) => {
            queryClient.setQueryData(["/api/v1/packing-lists"], context?.previousLists);
            toast({ title: "Error", description: "Failed to create packing list", variant: "destructive" });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/packing-lists"] });
        },
    });

    const updateListMutation = useMutation({
        mutationFn: async ({ id, newItems }: { id: string; newItems: IPackingListItem[] }) => {
            const res = await apiRequest("PUT", `/api/v1/packing-lists/${id}`, { items: newItems });
            return res.json();
        },
        onMutate: async ({ id, newItems }) => {
            await queryClient.cancelQueries({ queryKey: ["/api/v1/packing-lists"] });
            const previousLists = queryClient.getQueryData<PackingList[]>(["/api/v1/packing-lists"]);
            queryClient.setQueryData<PackingList[]>(["/api/v1/packing-lists"], (old) =>
                old?.map(list => (getId(list) === id ? { ...list, items: newItems } as PackingList : list)) || []
            );
            return { previousLists };
        },
        onSuccess: () => {
            toast({ title: "List Saved", description: "Your packing list has been updated successfully.", className: "bg-green-600 text-white border-none" });
        },
        onError: (err, variables, context) => {
            queryClient.setQueryData(["/api/v1/packing-lists"], context?.previousLists);
            toast({ title: "Error", description: "Failed to update packing list", variant: "destructive" });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/packing-lists"] });
        },
    });

    const duplicateListMutation = useMutation({
        mutationFn: async (listId: string) => {
            const res = await apiRequest("POST", `/api/v1/packing-lists/${listId}/duplicate`);
            return res.json();
        },
        onSuccess: (newList) => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/packing-lists"] });
            toast({ title: "List Duplicated", description: `Created copy: ${newList.name}`, className: "bg-blue-600 text-white border-none" });
        }
    });

    const handleCopyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(items, null, 2));
            toast({ title: "Copied to Clipboard", description: "Items copied! You can now paste them into another trip.", className: "bg-blue-600 text-white border-none" });
        } catch (err) {
            toast({ title: "Copy Failed", description: "Could not copy items to clipboard.", variant: "destructive" });
        }
    };

    const handlePasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const importedItems = JSON.parse(text);
            if (!Array.isArray(importedItems)) throw new Error("Invalid format");

            // Merge items, avoiding exact duplicates by name
            const existingNames = new Set(items.map(i => i.name.toLowerCase()));
            const newItems = [...items];
            let addedCount = 0;

            importedItems.forEach((item: any) => {
                if (item.name && !existingNames.has(item.name.toLowerCase())) {
                    newItems.push({
                        ...item,
                        quantity: item.quantity || 1,
                        packed: false // Reset packed status on paste
                    });
                    existingNames.add(item.name.toLowerCase());
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                updateLocalItems(newItems);
                toast({ title: "Items Pasted", description: `Successfully added ${addedCount} items.`, className: "bg-green-600 text-white border-none" });
            } else {
                toast({ title: "No New Items", description: "All items in clipboard already exist in this list." });
            }
        } catch (err) {
            toast({ title: "Paste Failed", description: "Clipboard content is not a valid item list.", variant: "destructive" });
        }
    };

    const createTemplateMutation = useMutation({
        mutationFn: async (data: { name: string, items: IPackingListItem[] }) => {
            const res = await apiRequest("POST", `/api/v1/packing-lists/templates`, data);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/packing-lists/templates"] });
            setIsTemplateModalOpen(false);
            setTemplateName("");
            toast({ title: "Template Saved", description: "You can now reuse this list for future trips." });
        }
    });

    const deleteTemplateMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiRequest("DELETE", `/api/v1/packing-lists/templates/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/packing-lists/templates"] });
            toast({ title: "Template Deleted" });
        }
    });

    const handleSave = (newItems: IPackingListItem[]) => {
        const currentId = currentList ? getId(currentList) : '';
        if (currentId && !currentId.startsWith("optimistic-")) {
            updateListMutation.mutate({ id: currentId, newItems });
        } else {
            createListMutation.mutate(newItems);
        }
    };

    const updateLocalItems = (newItems: PackingItem[]) => {
        setLocalItems(newItems);
        setIsDirty(true);
    };

    const handleQuantityChange = (index: number, newQty: number) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], quantity: newQty };
        updateLocalItems(newItems);
    };

    const handleToggle = (index: number) => {
        const newItems = items.map((item, i) => (i === index ? { ...item, packed: !item.packed } : item));
        updateLocalItems(newItems);
    };

    const toggleCategory = (cat: string) => {
        const newSet = new Set(collapsedCategories);
        if (newSet.has(cat)) newSet.delete(cat);
        else newSet.add(cat);
        setCollapsedCategories(newSet);
    };

    const handleDuplicate = () => {
        const currentId = currentList ? getId(currentList) : '';
        if (currentId && !currentId.startsWith("optimistic-")) duplicateListMutation.mutate(currentId);
    };

    const handleSaveTemplate = () => {
        if (!templateName) return;
        createTemplateMutation.mutate({ name: templateName, items: items.map(i => ({ ...i, packed: false })) });
    };

    const handleLoadTemplate = (template: any) => {
        const newItems = [
            ...items.filter(i => i.is_mandatory),
            ...template.items.map((i: any) => ({ ...i, packed: false }))
        ];
        updateLocalItems(newItems);
        toast({ title: "Template Loaded", description: `Loaded items from ${template.name}` });
    };

    const handlePrint = () => {
        window.print();
    };

    const handleSmartSuggest = async () => {
        let suggestedItems: PackingItem[] = [];

        // 1. Always include Mandatory & Seasonal Defaults
        const defaults = [
            ...MANDATORY_ITEMS.map(i => ({ ...i, quantity: 1, packed: false, category: "Government / ID Documents", is_mandatory: true })),
            ...SEASONAL_DEFAULTS[activeSeason].map(i => ({ ...i, quantity: 1, packed: false })),
        ];
        suggestedItems = [...defaults];

        // 2. If Trip Selected, fetch weather-based suggestions
        if (selectedTripId !== "none") {
            const trip = userTrips?.find(t => getId(t) === selectedTripId);
            if (trip && trip.destination) {
                try {
                    toast({ title: "Analyzing Weather...", description: `Checking forecast for ${trip.destination}...` });
                    const res = await apiRequest('GET', `/api/v1/weather?city=${encodeURIComponent(trip.destination)}`);
                    const data = await res.json();

                    const cond = String(data?.current?.condition || '').toLowerCase();
                    const temp = Number(data?.current?.temperature ?? 22);

                    const weatherAdditions: { name: string, category: string }[] = [];

                    if (cond.includes('rain') || cond.includes('drizzle')) {
                        weatherAdditions.push(
                            { name: 'Umbrella', category: 'Weather Gear' },
                            { name: 'Raincoat / Poncho', category: 'Weather Gear' },
                            { name: 'Waterproof Shoes', category: 'Footwear' }
                        );
                    }
                    if (temp < 15) {
                        weatherAdditions.push(
                            { name: 'Heavy Jacket', category: 'Clothing' },
                            { name: 'Gloves', category: 'Accessories' },
                            { name: 'Warm Beanie', category: 'Accessories' }
                        );
                    }
                    if (temp > 28) {
                        weatherAdditions.push(
                            { name: 'Sunscreen (High SPF)', category: 'Toiletries' },
                            { name: 'Sun Hat', category: 'Accessories' },
                            { name: 'Aloe Vera Gel', category: 'Toiletries' }
                        );
                    }

                    // Merchant/Transport specific? 
                    // For now just weather.

                    weatherAdditions.forEach(add => {
                        suggestedItems.push({ ...add, quantity: 1, packed: false });
                    });

                } catch (e) {
                    console.error("Weather fetch failed", e);
                    toast({ title: "Weather Check Failed", description: "Could not fetch weather data, using standard seasonal list.", variant: "destructive" });
                }
            }
        }

        // Merge with existing logic: 
        // We don't want to duplicate items that already exist by name.
        const existingNames = new Set(items.map(i => i.name.toLowerCase()));
        const newItems = [...items];
        let addedCount = 0;

        suggestedItems.forEach(s => {
            if (!existingNames.has(s.name.toLowerCase())) {
                newItems.push(s as PackingItem);
                existingNames.add(s.name.toLowerCase());
                addedCount++;
            }
        });

        if (addedCount > 0) {
            updateLocalItems(newItems);
            toast({ title: "Suggestions Added", description: `Added ${addedCount} items based on ${activeSeason} ${selectedTripId !== 'none' ? '& Weather' : ''}.`, className: "bg-green-600 text-white border-none" });
        } else {
            toast({ title: "No New Suggestions", description: "Your list already contains all recommended items." });
        }
    };

    const handleDelete = (index: number) => {
        if (items[index].is_mandatory) {
            toast({ title: "Cannot Delete", description: "This is a mandatory government document.", variant: "destructive" });
            return;
        }
        const newItems = items.filter((_, i) => i !== index);
        updateLocalItems(newItems);
    };

    const handleAdd = () => {
        if (!newItemName.trim()) return;
        const newItem: IPackingListItem = {
            name: newItemName,
            quantity: 1,
            packed: false,
            category: "Misc",
        };
        updateLocalItems([...items, newItem]);
        setNewItemName("");
    };

    // Reorder.Group only sees one category's (filtered, visible) items at a
    // time, so we can't just replace `items` with what it hands back — that
    // would drop every item outside this category/filter. Instead walk the
    // full list in its existing order and, at each slot that belonged to
    // this visible subset (matched by object identity), substitute the next
    // item from the new order — leaving every other item exactly where it was.
    const handleReorderCategory = (category: string, newOrder: PackingItem[]) => {
        const inThisDrag = new Set(newOrder);
        let cursor = 0;
        const updated = items.map((item) => {
            let cat = item.category || "Misc";
            if (cat === "Documents") cat = "Government / ID Documents";
            if (cat === category && inThisDrag.has(item)) {
                return newOrder[cursor++];
            }
            return item;
        });
        updateLocalItems(updated);
    };

    // Filter Logic
    const filteredItems = items.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchFilter = filterBy === "all" ? true : filterBy === "packed" ? item.packed : !item.packed;
        return matchSearch && matchFilter;
    });

    const itemsByCategory = filteredItems.reduce((acc, item) => {
        // Rename 'Documents' category to 'Government / ID Documents' for display if needed
        let cat = item.category || "Misc";
        if (cat === "Documents") cat = "Government / ID Documents";

        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {} as Record<string, PackingItem[]>);

    const mandatoryItems = items.filter(i => i.is_mandatory);
    const packedCount = items.filter(i => i.packed).length;

    const getSeasonIcon = (season: Season) => {
        switch (season) {
            case "Summer": return <Sun className="w-4 h-4 mr-2" />;
            case "Winter": return <Snowflake className="w-4 h-4 mr-2" />;
            case "Spring": return <Leaf className="w-4 h-4 mr-2" />;
            case "Autumn": return <CloudRain className="w-4 h-4 mr-2" />;
        }
    };

    return (
        <div className="min-h-screen bg-background pb-20 font-sans-clean print:bg-card print:text-black print:pb-0">
            <style>{`
                @media print {
                    @page { margin: 1cm; size: auto; }
                    body, #root, main, .min-h-screen { 
                        background-color: white !important; 
                        color: black !important; 
                        overflow: visible !important; 
                        height: auto !important; 
                        width: auto !important;
                        position: relative !important;
                        display: block !important;
                    }
                    .no-print, button, [role="tablist"], header, nav, .fixed { display: none !important; }
                    .print-visible { display: block !important; }
                    /* Expands scrollable areas */
                    .overflow-y-auto, .overflow-hidden { overflow: visible !important; height: auto !important; }
                }
            `}</style>
            <div className="max-w-3xl mx-auto px-4 pt-6">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-foreground mb-2">Smart Packing List</h1>
                    <p className="text-muted-foreground">Review your customized packing checklist based on the season.</p>
                </div>

                <Tabs value={activeSeason} onValueChange={(v) => setActiveSeason(v as Season)} className="mb-8">
                    <TabsList className="grid grid-cols-4 bg-card border border rounded-full p-1 h-12">
                        {SEASONS.map(season => {
                            const labels = {
                                Summer: "Summer",
                                Winter: "Winter",
                                Spring: "Spring",
                                Autumn: "Autumn"
                            };
                            return (
                                <TabsTrigger
                                    key={season}
                                    value={season}
                                    className="min-w-0 px-1 rounded-full data-[state=active]:bg-[#163F73] data-[state=active]:text-white transition-all duration-300 flex items-center justify-center gap-1 sm:gap-2"
                                >
                                    {getSeasonIcon(season)}
                                    <span className="text-[11px] sm:text-sm font-medium truncate">{labels[season]}</span>
                                </TabsTrigger>
                            )
                        })}
                    </TabsList>
                </Tabs>

                {/* TRIP ASSIGNMENT & ACTIONS BAR */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-center bg-card p-4 rounded-3xl border border shadow-sm">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <MapPin className="text-muted-foreground w-4 h-4" />
                        <Select value={selectedTripId} onValueChange={setSelectedTripId}>
                            <SelectTrigger className="w-full sm:w-[200px] bg-muted/50 border">
                                <SelectValue placeholder="Assign to Trip" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border text-foreground">
                                <SelectItem value="none">General List (No Trip)</SelectItem>
                                {userTrips?.map(trip => {
                                    const tId = String(trip._id || (trip as any).id || "unknown");
                                    return (
                                        <SelectItem key={tId} value={tId}>
                                            {trip.destination} {trip.startDate ? `(${new Date(trip.startDate).toLocaleDateString()})` : ''}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            title="Smart Suggest (AI)"
                            onClick={handleSmartSuggest}
                            className="border-amber-400/50 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                        >
                            <Lightbulb className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            title="Save List"
                            onClick={() => handleSave(items)}
                            className={`border hover:bg-muted/50 ${isDirty ? 'text-blue-400 border-blue-400' : 'text-muted-foreground'}`}
                        >
                            <Save className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" title="Duplicate List" onClick={handleDuplicate} className="border hover:bg-muted/50">
                            <Copy className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="outline" size="icon" title="Copy Items to Clipboard" onClick={handleCopyToClipboard} className="border hover:bg-muted/50">
                            <ClipboardCopy className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="outline" size="icon" title="Paste Items from Clipboard" onClick={handlePasteFromClipboard} className="border hover:bg-muted/50">
                            <ClipboardPaste className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="outline" size="icon" title="Print" onClick={handlePrint} className="border hover:bg-muted/50">
                            <Printer className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" title="Templates" className="border hover:bg-muted/50">
                                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border text-foreground w-64">
                                <DropdownMenuLabel>Templates</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => setIsTemplateModalOpen(true)}>
                                    <Save className="w-4 h-4 mr-2" /> Save Current List As Template
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {(!templates || templates.length === 0) ? (
                                    <div className="px-2 py-2 text-xs text-muted-foreground">No saved templates yet</div>
                                ) : (
                                    templates.map((t: any) => (
                                        <div key={getId(t)} className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 rounded-sm">
                                            <button
                                                className="flex-1 text-left text-sm text-foreground truncate"
                                                onClick={() => setTemplateToLoad(t)}
                                            >
                                                {t.name}
                                            </button>
                                            <button
                                                className="text-muted-foreground hover:text-red-500 p-1"
                                                title="Delete template"
                                                onClick={(e) => { e.stopPropagation(); deleteTemplateMutation.mutate(getId(t)); }}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>

                    </div>
                </div>

                <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Save as Template</DialogTitle>
                            <DialogDescription>Reuse this list's items for future trips.</DialogDescription>
                        </DialogHeader>
                        <div>
                            <Label htmlFor="template-name">Template Name</Label>
                            <Input
                                id="template-name"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="e.g. Beach Trip Essentials"
                                className="mt-2"
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsTemplateModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleSaveTemplate} disabled={!templateName || createTemplateMutation.isPending}>
                                {createTemplateMutation.isPending ? 'Saving...' : 'Save Template'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <AlertDialog open={!!templateToLoad} onOpenChange={(open) => !open && setTemplateToLoad(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Load "{templateToLoad?.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This replaces your current items (mandatory documents are kept). This can't be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    if (templateToLoad) handleLoadTemplate(templateToLoad);
                                    setTemplateToLoad(null);
                                }}
                            >
                                Load Template
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* SEARCH & FILTER */}
                <div className="flex gap-2 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search items..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-card border pl-9 rounded-xl text-foreground"
                        />
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border bg-card rounded-xl text-foreground">
                                <Filter className="w-4 h-4 mr-2" />
                                {filterBy === "all" ? "All" : filterBy === "packed" ? "Packed" : "Unpacked"}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-card border text-foreground">
                            <DropdownMenuItem onClick={() => setFilterBy("all")}>All Items</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilterBy("packed")}>Packed Only</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilterBy("unpacked")}>Unpacked Only</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {items.length > 0 && (
                    <div className="bg-card border rounded-3xl p-4 mb-6 shadow-sm">
                        <div className="flex justify-between items-center mb-2 text-sm">
                            <span className="font-medium text-foreground">Packing progress</span>
                            <span className="text-muted-foreground">{packedCount} / {items.length} packed</span>
                        </div>
                        <Progress value={(packedCount / items.length) * 100} className="h-2" />
                    </div>
                )}

                <div className="space-y-6 mb-8">
                    {Object.entries(itemsByCategory).map(([category, catItems]) => {
                        const displayItems = catItems;
                        if (displayItems.length === 0) return null;

                        return (
                            <Card key={category} className="bg-card border rounded-3xl overflow-hidden shadow-sm">
                                <div
                                    className="flex justify-between items-center p-4 bg-muted/50 cursor-pointer hover:bg-gray-100 transition-colors"
                                    onClick={() => toggleCategory(category)}
                                >
                                    <h3 className="font-semibold text-lg flex items-center">
                                        {collapsedCategories.has(category) ? <ChevronRight className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                                        {category}
                                        <span className="ml-2 text-xs bg-gray-100 text-muted-foreground px-2 py-0.5 rounded-full">{displayItems.length}</span>
                                    </h3>
                                    <div className="text-sm text-muted-foreground">
                                        {displayItems.filter(i => i.packed).length}/{displayItems.length} packed
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {!collapsedCategories.has(category) && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <CardContent className="p-4 space-y-2">
                                                <Reorder.Group axis="y" values={displayItems} onReorder={(newOrder) => handleReorderCategory(category, newOrder as PackingItem[])} className="space-y-2">
                                                    {displayItems.map((item) => (
                                                        <SortablePackingItem
                                                            key={`${item.name}-${items.indexOf(item)}`}
                                                            item={item}
                                                            handleToggle={() => {
                                                                const idx = items.indexOf(item);
                                                                if (idx !== -1) handleToggle(idx);
                                                            }}
                                                            handleDelete={() => {
                                                                const idx = items.indexOf(item);
                                                                if (idx !== -1) handleDelete(idx);
                                                            }}
                                                            handleQuantityChange={(qty) => {
                                                                const idx = items.indexOf(item);
                                                                if (idx !== -1) handleQuantityChange(idx, qty);
                                                            }}
                                                        />
                                                    ))}
                                                </Reorder.Group>
                                            </CardContent>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </Card>
                        );
                    })}
                </div>

                <div className="flex gap-3 mb-12">
                    <Input
                        placeholder="Add custom item..."
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                        className="bg-card border text-foreground rounded-full h-12 px-6 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <Button onClick={handleAdd} className="bg-[#163F73] hover:bg-[#0F2C52] text-white rounded-full h-12 px-6">
                        <Plus className="w-5 h-5 mr-2" /> Add
                    </Button>
                </div>

                <div className="flex gap-4 justify-center pb-8">
                    <Button
                        variant="outline"
                        className="border text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded-full"
                        onClick={() => {
                            const newItems = items.map(i => ({ ...i, packed: true }));
                            updateLocalItems(newItems);
                        }}
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Mark All Packed
                    </Button>
                    <Button
                        variant="outline"
                        className="border text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded-full"
                        onClick={() => {
                            const newItems = items.map(i => ({ ...i, packed: false }));
                            updateLocalItems(newItems);
                        }}
                    >
                        Clear All
                    </Button>
                </div>

            </div>
        </div>
    );
}
