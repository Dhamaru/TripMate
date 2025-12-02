import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { PackingList as PackingListType, Trip } from "@shared/schema";

interface PackingItem {
  id: string;
  name: string;
  quantity: number;
  packed: boolean;
  category?: string;
}

interface PackingListProps {
  tripId?: string;
  city?: string;
  isInternational?: boolean;
  className?: string;
}

export function PackingList({ tripId, city, isInternational, className = '' }: PackingListProps) {
  const [newItemName, setNewItemName] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: packingLists, isLoading } = useQuery<PackingListType[]>({
    queryKey: ['/api/v1/packing-lists'],
  });

  // Get the current packing list (first one or trip-specific)
  const currentList = packingLists?.find(list => !tripId || list.tripId?.toString() === tripId) || packingLists?.[0];
  const items: PackingItem[] = currentList?.items as PackingItem[] || [];

  const { data: trip } = useQuery<Trip>({
    queryKey: ['/api/v1/trips', tripId || ''],
    enabled: !!tripId,
  });

  const createListMutation = useMutation({
    mutationFn: async (data: { name: string; tripId?: string; items: PackingItem[] }) => {
      const response = await apiRequest('POST', '/api/v1/packing-lists', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/packing-lists'] });
      toast({
        title: "Success",
        description: "Packing list created successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/signin";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to create packing list",
        variant: "destructive",
      });
    },
  });

  const updateListMutation = useMutation({
    mutationFn: async (data: { id: string; items: PackingItem[] }) => {
      // Map id to _id for backend persistence to prevent ID churn
      const itemsForBackend = data.items.map(item => ({
        ...item,
        _id: item.id.length === 24 ? item.id : undefined // Only send if it looks like a Mongo ID
      }));
      const response = await apiRequest('PUT', `/api/v1/packing-lists/${data.id}`, { items: itemsForBackend });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/packing-lists'] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/signin";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update packing list",
        variant: "destructive",
      });
    },
  });

  const addItem = async () => {
    if (!newItemName.trim()) return;

    const newItem: PackingItem = {
      id: Date.now().toString(),
      name: newItemName.trim(),
      quantity: 1,
      packed: false,
    };

    if (currentList) {
      const updatedItems = [...items, newItem];
      updateListMutation.mutate({ id: currentList.id, items: updatedItems });
    } else {
      // Create new packing list
      createListMutation.mutate({
        name: 'My Packing List',
        tripId,
        items: [newItem],
      });
    }

    setNewItemName('');
  };

  const toggleItem = (itemId: string) => {
    if (!currentList) return;

    const updatedItems = items.map(item =>
      item.id === itemId ? { ...item, packed: !item.packed } : item
    );
    updateListMutation.mutate({ id: currentList.id, items: updatedItems });
  };

  const removeItem = (itemId: string) => {
    if (!currentList) return;

    const updatedItems = items.filter(item => item.id !== itemId);
    updateListMutation.mutate({ id: currentList.id, items: updatedItems });
  };

  const generateSmartSuggestions = async () => {
    try {
      setSuggesting(true);
      const base = [
        { name: 'Phone Charger', category: 'electronics' },
        { name: 'Toothbrush', category: 'toiletries' },
        { name: 'Comfortable Walking Shoes', category: 'clothing' },
        { name: 'First Aid Kit', category: 'health' },
      ];
      const effectiveInternational = typeof isInternational === 'boolean' ? isInternational : !!trip?.isInternational;
      const passportItems = effectiveInternational ? [{ name: 'Passport & Documents', category: 'documents' }] : [];

      let weatherItems: Array<{ name: string; category?: string }> = [];
      const effectiveCity = city || trip?.destination || '';
      if (effectiveCity) {
        try {
          const res = await apiRequest('GET', `/api/v1/weather?city=${encodeURIComponent(effectiveCity)}`);
          const data = await res.json();
          const temp = Number(data?.current?.temperature ?? 22);
          const cond = String(data?.current?.condition || '').toLowerCase();
          const hum = Number(data?.current?.humidity ?? 60);
          if (cond.includes('rain')) {
            weatherItems.push({ name: 'Umbrella', category: 'weather' });
            weatherItems.push({ name: 'Raincoat', category: 'weather' });
            weatherItems.push({ name: 'Waterproof Shoes', category: 'clothing' });
            weatherItems.push({ name: 'Extra Socks', category: 'clothing' });
          }
          if (cond.includes('snow') || temp <= 10) {
            weatherItems.push({ name: 'Warm Jacket', category: 'clothing' });
            weatherItems.push({ name: 'Thermal Wear', category: 'clothing' });
            weatherItems.push({ name: 'Gloves', category: 'clothing' });
            weatherItems.push({ name: 'Scarf', category: 'clothing' });
            weatherItems.push({ name: 'Beanie', category: 'clothing' });
          }
          if (cond.includes('sun') || temp >= 28) {
            weatherItems.push({ name: 'Sunscreen', category: 'health' });
            weatherItems.push({ name: 'Sunglasses', category: 'accessories' });
            weatherItems.push({ name: 'Cap/Hat', category: 'accessories' });
            weatherItems.push({ name: 'Light Cotton Clothing', category: 'clothing' });
            weatherItems.push({ name: 'Reusable Water Bottle', category: 'health' });
          }
          if (cond.includes('wind')) {
            weatherItems.push({ name: 'Windcheater', category: 'clothing' });
          }
          if (hum >= 70) {
            weatherItems.push({ name: 'Mosquito Repellent', category: 'health' });
            weatherItems.push({ name: 'Anti-chafing Powder', category: 'health' });
          }
        } catch { }
      }

      let transportItems: Array<{ name: string; category?: string }> = [];
      const transport = trip?.transportMode || '';
      if (transport === 'flight') {
        transportItems.push({ name: 'Neck Pillow', category: 'accessories' });
        transportItems.push({ name: 'Eye Mask', category: 'accessories' });
        transportItems.push({ name: 'Earplugs', category: 'accessories' });
        transportItems.push({ name: 'Power Bank', category: 'electronics' });
      } else if (transport === 'train') {
        transportItems.push({ name: 'Travel Pillow', category: 'accessories' });
        transportItems.push({ name: 'Snacks', category: 'food' });
        transportItems.push({ name: 'Water Bottle', category: 'health' });
      } else if (transport === 'bus') {
        transportItems.push({ name: 'Travel Blanket', category: 'accessories' });
        transportItems.push({ name: 'Snacks', category: 'food' });
      } else if (transport === 'car') {
        transportItems.push({ name: 'Roadside Kit', category: 'safety' });
        transportItems.push({ name: 'Car Documents', category: 'documents' });
      } else if (transport === 'ship') {
        transportItems.push({ name: 'Motion Sickness Pills', category: 'health' });
      }

      const suggestions = [...passportItems, ...base, ...weatherItems, ...transportItems];
      const existingNames = items.map(i => i.name.toLowerCase());
      const filtered = suggestions.filter(s => !existingNames.includes(s.name.toLowerCase()));
      if (!filtered.length) {
        toast({ title: 'No new suggestions', description: 'You already have all recommended items' });
        return;
      }
      const itemsToAdd = filtered.slice(0, 8).map(s => ({
        id: Date.now().toString() + Math.random(),
        name: s.name,
        quantity: 1,
        packed: false,
        category: s.category,
      }));
      if (currentList) {
        const updatedItems = [...items, ...itemsToAdd];
        updateListMutation.mutate({ id: currentList.id, items: updatedItems });
      } else {
        createListMutation.mutate({ name: 'My Packing List', tripId, items: itemsToAdd });
      }
      toast({ title: 'Smart suggestions added', description: `Added ${itemsToAdd.length} items for ${effectiveCity || 'your trip'}` });
    } finally {
      setSuggesting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="packing-list-loading">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Smart Packing List</CardTitle>
        </CardHeader>
        <CardContent>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center space-x-3 p-3 mb-2">
              <Skeleton className="w-4 h-4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="w-6 h-6" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const packedCount = items.filter(item => item.packed).length;
  const totalCount = items.length;

  return (
    <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="packing-list">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold text-white">Smart Packing List</CardTitle>
          <Button
            onClick={generateSmartSuggestions}
            size="sm"
            variant="outline"
            className="bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
            data-testid="button-smart-suggestions"
            disabled={suggesting}
          >
            <i className="fas fa-lightbulb text-ios-orange mr-1"></i>
            Suggest
          </Button>
        </div>
        {totalCount > 0 && (
          <p className="text-sm text-ios-gray">
            {packedCount} of {totalCount} items packed
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center space-x-3 p-3 bg-ios-darker rounded-xl"
            data-testid={`packing-item-${item.id}`}
          >
            <Checkbox
              checked={item.packed}
              onCheckedChange={() => toggleItem(item.id)}
              className="border-ios-gray data-[state=checked]:bg-ios-blue"
              data-testid={`checkbox-item-${item.id}`}
            />
            <span
              className={`flex-1 text-sm ${item.packed ? 'line-through text-ios-gray' : 'text-white'
                }`}
            >
              {item.name}
            </span>
            <Button
              onClick={() => removeItem(item.id)}
              size="sm"
              variant="ghost"
              className="text-ios-red hover:text-red-400 h-6 w-6 p-0"
              data-testid={`button-remove-${item.id}`}
            >
              <i className="fas fa-trash text-xs"></i>
            </Button>
          </div>
        ))}

        <div className="flex space-x-2">
          <Input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Add new item..."
            className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray flex-1"
            onKeyPress={(e) => e.key === 'Enter' && addItem()}
            data-testid="input-new-item"
          />
          <Button
            onClick={addItem}
            className="bg-ios-blue hover:bg-blue-600"
            disabled={!newItemName.trim() || createListMutation.isPending || updateListMutation.isPending}
            data-testid="button-add-item"
          >
            <i className="fas fa-plus"></i>
          </Button>
        </div>

        {totalCount === 0 && (
          <div className="text-center py-8">
            <div className="text-ios-gray mb-4">
              <i className="fas fa-suitcase text-4xl"></i>
            </div>
            <p className="text-ios-gray text-sm mb-2">Your packing list is empty</p>
            <p className="text-ios-gray text-xs">
              Add items manually or use smart suggestions
            </p>
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-ios-gray">
            <i className="fas fa-lightbulb text-ios-orange mr-1"></i>
            AI suggests items based on weather & destination
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
