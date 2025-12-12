import { SortablePackingItem } from "@/components/SortablePackingItem";
import { useState } from "react";

type PackingItem = IPackingListItem & { is_mandatory?: boolean; category?: string };
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { PackingList, IPackingListItem } from "@shared/schema";
import { motion } from "framer-motion";

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

    const { data: packingLists, isLoading } = useQuery<PackingList[]>({
        queryKey: ["/api/v1/packing-lists"],
    });

    const currentList = packingLists?.find((list) => list.season === activeSeason || list.name.includes(activeSeason));

    const getItems = (): PackingItem[] => {
        if (currentList) {
            return currentList.items;
        } else if (!isLoading && packingLists) {
            return [
                ...MANDATORY_ITEMS.map(i => ({ ...i, quantity: 1, packed: false, category: "Documents", is_mandatory: true })),
                ...SEASONAL_DEFAULTS[activeSeason].map(i => ({ ...i, quantity: 1, packed: false })),
            ];
        }
        return [];
    };

    const items: PackingItem[] = getItems();

    const createListMutation = useMutation({
        mutationFn: async (newItems: IPackingListItem[]) => {
            const res = await apiRequest("POST", "/api/v1/packing-lists", {
                name: `${activeSeason} Packing List`,
                season: activeSeason,
                items: newItems,
            });
            return res.json();
        },
        onMutate: async (newItems) => {
            await queryClient.cancelQueries({ queryKey: ["/api/v1/packing-lists"] });
            const previousLists = queryClient.getQueryData<PackingList[]>(["/api/v1/packing-lists"]);
            const optimisticList: PackingList = {
                _id: "optimistic-" + Date.now(),
                name: `${activeSeason} Packing List`,
                season: activeSeason,
                items: newItems,
                userId: "current-user",
                createdAt: new Date(),
                updatedAt: new Date(),
            } as PackingList;
            queryClient.setQueryData<PackingList[]>(["/api/v1/packing-lists"], (old) => old ? [...old, optimisticList] : [optimisticList]);
            return { previousLists };
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
        onError: (err, variables, context) => {
            queryClient.setQueryData(["/api/v1/packing-lists"], context?.previousLists);
            toast({ title: "Error", description: "Failed to update packing list", variant: "destructive" });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/packing-lists"] });
        },
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
            createListMutation.mutate(newItems);
        }
    };

    const handleToggle = (index: number) => {
        const newItems = items.map((item, i) => (i === index ? { ...item, packed: !item.packed } : item));
        handleSave(newItems);
    };

    const handleDelete = (index: number) => {
        if (items[index].is_mandatory) {
            toast({ title: "Cannot Delete", description: "This is a mandatory government document.", variant: "destructive" });
            return;
        }
        const newItems = items.filter((_, i) => i !== index);
        handleSave(newItems);
    };

    const handleAdd = () => {
        if (!newItemName.trim()) return;
        const newItem: IPackingListItem = {
            name: newItemName,
            quantity: 1,
            packed: false,
            category: "Misc",
        };
        handleSave([...items, newItem]);
        setNewItemName("");
    };

    const handleReorder = (newOrder: PackingItem[]) => {
        const mandatoryItems = items.filter(i => i.is_mandatory);
        handleSave([...mandatoryItems, ...newOrder]);
    };

    const mandatoryItems = items.filter(i => i.is_mandatory);
    const otherItems = items.filter(i => !i.is_mandatory);

    const packedCount = items.filter(i => i.packed).length;
    const progress = items.length > 0 ? (packedCount / items.length) * 100 : 0;

    const getSeasonIcon = (season: Season) => {
        switch (season) {
            case "Summer": return <Sun className="w-4 h-4 mr-2" />;
            case "Winter": return <Snowflake className="w-4 h-4 mr-2" />;
            case "Spring": return <Leaf className="w-4 h-4 mr-2" />;
            case "Autumn": return <CloudRain className="w-4 h-4 mr-2" />;
        }
    };

    return (
        <div className="min-h-screen bg-black text-white pb-20 font-sans">
            <div className="max-w-3xl mx-auto px-4 pt-header-gap">
                <Tabs value={activeSeason} onValueChange={(v) => setActiveSeason(v as Season)} className="mb-8">
                    <TabsList className="grid grid-cols-4 bg-gray-900 rounded-full p-1 h-12">
                        {SEASONS.map(season => (
                            <TabsTrigger
                                key={season}
                                value={season}
                                className="rounded-full data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all duration-300"
                            >
                                {getSeasonIcon(season)}
                                <span className="hidden sm:inline">{season}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                <Card className="bg-gray-900 border-gray-800 mb-8 rounded-3xl overflow-hidden">
                    <CardContent className="p-6">
                        <div className="flex justify-between text-sm mb-3">
                            <span className="text-gray-400">Progress</span>
                            <span className="font-bold text-blue-400">{packedCount} / {items.length} items</span>
                        </div>
                        <Progress value={progress} className="h-3 rounded-full bg-gray-800" />
                    </CardContent>
                </Card>

                <div className="mb-8">
                    <h2 className="font-bold text-lg text-white mb-4">Seasonal Essentials</h2>
                    <Reorder.Group axis="y" values={otherItems} onReorder={handleReorder}>
                        <div className="space-y-3">
                            {otherItems.map((item) => (
                                <SortablePackingItem
                                    key={item.name}
                                    item={item}
                                    handleToggle={() => {
                                        const originalIndex = items.indexOf(item);
                                        if (originalIndex !== -1) handleToggle(originalIndex);
                                    }}
                                    handleDelete={() => {
                                        const originalIndex = items.indexOf(item);
                                        if (originalIndex !== -1) handleDelete(originalIndex);
                                    }}
                                />
                            ))}
                        </div>
                    </Reorder.Group>
                </div>

                <div className="mb-8">
                    <div className="flex items-center mb-4 text-red-400">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        <h2 className="font-bold text-lg">Government / ID Documents</h2>
                    </div>
                    <div className="space-y-3">
                        {mandatoryItems.map((item, idx) => (
                            <div
                                key={`mandatory-${idx}`}
                                className="group flex items-center p-4 bg-gray-900/50 border border-red-900/30 rounded-2xl hover:bg-gray-900 transition-colors cursor-pointer"
                                onClick={() => {
                                    const originalIndex = items.findIndex(i => i.name === item.name && i.is_mandatory);
                                    if (originalIndex !== -1) handleToggle(originalIndex);
                                }}
                            >
                                <div className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center transition-colors ${item.packed ? 'bg-green-500 border-green-500' : 'border-gray-600 group-hover:border-gray-400'}`}>
                                    {item.packed && <CheckCircle2 className="w-4 h-4 text-white" />}
                                </div>
                                <span className={`flex-1 font-medium ${item.packed ? "text-gray-500 line-through" : "text-white"}`}>{item.name}</span>
                                <div className="text-xs font-semibold text-red-400 bg-red-900/20 px-3 py-1 rounded-full">Mandatory</div>
                            </div>
                        ))}
                    </div>
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
                            handleSave(newItems);
                        }}
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Mark All Packed
                    </Button>
                    <Button
                        variant="outline"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white rounded-full"
                        onClick={() => {
                            const newItems = items.map(i => ({ ...i, packed: false }));
                            handleSave(newItems);
                        }}
                    >
                        Clear All
                    </Button>
                </div>
            </div>
        </div>
    );
}
