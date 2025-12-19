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
    ClipboardPaste
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

    const { data: userTrips } = useQuery<Trip[]>({
        queryKey: ["/api/v1/trips?light=true"],
    });

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
                ? userTrips?.find(t => String(t._id) === tripId)?.destination || "Trip"
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
                ? userTrips?.find(t => String(t._id) === tripId)?.destination || "Trip"
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
                old?.map(list => (list._id === id ? { ...list, items: newItems } as PackingList : list)) || []
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

    // ... (rest of the file until return)

    // In the JSX (Actions Bar):
    // Previously:
    // <Button ... onClick={() => handleSave(items)} ...> <Save ... /> </Button>
    // <Button ... onClick={handleDuplicate} ...> <Copy ... /> </Button>
    // <Button ... onClick={handlePrint} ...> <Printer ... /> </Button>

    /* 
       We need to replace the Actions Bar section in the JSX.
       I will use a wider replacement range to cover mutations AND the UI.
       Wait, the tool only allows replacing contiguous blocks but I can update mutations here.
       I'll update mutations first, then separate call for UI?
       No, `multi_replace` is better or just replace the component body parts.
       Actually, `replace_file_content` with a larger scope spanning mutations.
    */


    const deleteTemplateMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiRequest("DELETE", `/api/v1/packing-lists/templates/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/packing-lists/templates"] });
            toast({ title: "Template Deleted" });
        }
    });

    const saveList = (newItems: IPackingListItem[]) => {
        if (currentList && currentList._id && !String(currentList._id).startsWith("optimistic-")) {
            updateListMutation.mutate({ id: String(currentList._id), newItems });
        } else {
            createListMutation.mutate(newItems);
        }
    };

    const handleSave = (newItems: IPackingListItem[]) => {
        if (currentList && currentList._id && !String(currentList._id).startsWith("optimistic-")) {
            updateListMutation.mutate({ id: String(currentList._id), newItems });
        } else {
            // Include selectedTripId if set
            const tripData = selectedTripId !== "none" ? { tripId: selectedTripId } : {};
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
        if (currentList?._id) duplicateListMutation.mutate(String(currentList._id));
    };

    const handleSaveTemplate = () => {
        if (!templateName) return;
        createTemplateMutation.mutate({ name: templateName, items: items.map(i => ({ ...i, packed: false })) });
    };

    const handleLoadTemplate = (template: any) => {
        // Confirm overwrite?
        const confirmed = window.confirm("This will replace current items (excluding mandatory). Continue?");
        if (!confirmed) return;

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

    const handleReorder = (newOrder: PackingItem[]) => {
        // Implementation for reordering if needed in future
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
        <div className="min-h-screen bg-background text-white pb-20 font-sans print:bg-white print:text-black print:pb-0">
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
                    <h1 className="text-3xl font-bold text-white mb-2">Smart Packing List</h1>
                    <p className="text-gray-400">Review your customized packing checklist based on the season.</p>
                </div>

                <Tabs value={activeSeason} onValueChange={(v) => setActiveSeason(v as Season)} className="mb-8">
                    <TabsList className="grid grid-cols-4 bg-gray-900 rounded-full p-1 h-12">
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
                                    className="rounded-full data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all duration-300 flex items-center justify-center gap-2"
                                >
                                    {getSeasonIcon(season)}
                                    <span className="text-xs sm:text-sm font-medium">{labels[season]}</span>
                                </TabsTrigger>
                            )
                        })}
                    </TabsList>
                </Tabs>

                {/* TRIP ASSIGNMENT & ACTIONS BAR */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-center bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <MapPin className="text-gray-400 w-4 h-4" />
                        <Select value={selectedTripId} onValueChange={setSelectedTripId}>
                            <SelectTrigger className="w-full sm:w-[200px] bg-gray-800 border-none">
                                <SelectValue placeholder="Assign to Trip" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700 text-white">
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

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            title="Save List"
                            onClick={() => handleSave(items)}
                            className={`border-gray-700 hover:bg-gray-800 ${isDirty ? 'text-blue-400 border-blue-400' : 'text-gray-400'}`}
                        >
                            <Save className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" title="Duplicate List" onClick={handleDuplicate} className="border-gray-700 hover:bg-gray-800">
                            <Copy className="w-4 h-4 text-gray-400" />
                        </Button>
                        <Button variant="outline" size="icon" title="Copy Items to Clipboard" onClick={handleCopyToClipboard} className="border-gray-700 hover:bg-gray-800">
                            <ClipboardCopy className="w-4 h-4 text-gray-400" />
                        </Button>
                        <Button variant="outline" size="icon" title="Paste Items from Clipboard" onClick={handlePasteFromClipboard} className="border-gray-700 hover:bg-gray-800">
                            <ClipboardPaste className="w-4 h-4 text-gray-400" />
                        </Button>
                        <Button variant="outline" size="icon" title="Print" onClick={handlePrint} className="border-gray-700 hover:bg-gray-800">
                            <Printer className="w-4 h-4 text-gray-400" />
                        </Button>

                    </div>
                </div>

                {/* SEARCH & FILTER */}
                <div className="flex gap-2 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                            placeholder="Search items..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-gray-900 border-gray-800 pl-9 rounded-xl"
                        />
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="border-gray-800 bg-gray-900 rounded-xl">
                                <Filter className="w-4 h-4 mr-2" />
                                {filterBy === "all" ? "All" : filterBy === "packed" ? "Packed" : "Unpacked"}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-gray-900 border-gray-800 text-white">
                            <DropdownMenuItem onClick={() => setFilterBy("all")}>All Items</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilterBy("packed")}>Packed Only</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilterBy("unpacked")}>Unpacked Only</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* PROGRESS BAR REMOVED */}

                <div className="space-y-6 mb-8">
                    {Object.entries(itemsByCategory).map(([category, catItems]) => {
                        const displayItems = catItems;
                        if (displayItems.length === 0) return null;

                        return (
                            <Card key={category} className="bg-gray-900 border-gray-800 overflow-hidden">
                                <div
                                    className="flex justify-between items-center p-4 bg-gray-800/50 cursor-pointer hover:bg-gray-800 transition-colors"
                                    onClick={() => toggleCategory(category)}
                                >
                                    <h3 className="font-semibold text-lg flex items-center">
                                        {collapsedCategories.has(category) ? <ChevronRight className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                                        {category}
                                        <span className="ml-2 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{displayItems.length}</span>
                                    </h3>
                                    <div className="text-sm text-gray-400">
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
                                                <Reorder.Group axis="y" values={displayItems} onReorder={() => { }} className="space-y-2">
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
                        className="bg-gray-900 border-gray-800 text-white rounded-full h-12 px-6 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-500 rounded-full h-12 px-6">
                        <Plus className="w-5 h-5 mr-2" /> Add
                    </Button>
                </div>

                <div className="flex gap-4 justify-center pb-8">
                    <Button
                        variant="outline"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white rounded-full"
                        onClick={() => {
                            const newItems = items.map(i => ({ ...i, packed: true }));
                            updateLocalItems(newItems);
                        }}
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Mark All Packed
                    </Button>
                    <Button
                        variant="outline"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white rounded-full"
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
