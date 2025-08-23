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
import type { PackingList as PackingListType } from "@shared/schema";

interface PackingItem {
  id: string;
  name: string;
  packed: boolean;
  category?: string;
}

interface PackingListProps {
  tripId?: string;
  className?: string;
}

export function PackingList({ tripId, className = '' }: PackingListProps) {
  const [newItemName, setNewItemName] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: packingLists, isLoading } = useQuery<PackingListType[]>({
    queryKey: ['/api/packing-lists'],
  });

  // Get the current packing list (first one or trip-specific)
  const currentList = packingLists?.find(list => !tripId || list.tripId === tripId) || packingLists?.[0];
  const items: PackingItem[] = currentList?.items as PackingItem[] || [];

  const createListMutation = useMutation({
    mutationFn: async (data: { name: string; tripId?: string; items: PackingItem[] }) => {
      const response = await apiRequest('POST', '/api/packing-lists', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/packing-lists'] });
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
          window.location.href = "/api/login";
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
      const response = await apiRequest('PUT', `/api/packing-lists/${data.id}`, { items: data.items });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/packing-lists'] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
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

  const generateSmartSuggestions = () => {
    const suggestions = [
      { name: 'Passport & Documents', category: 'documents' },
      { name: 'Phone Charger', category: 'electronics' },
      { name: 'Toothbrush', category: 'toiletries' },
      { name: 'Sunscreen', category: 'health' },
      { name: 'Comfortable Walking Shoes', category: 'clothing' },
      { name: 'First Aid Kit', category: 'health' },
    ];

    // Add suggestions that aren't already in the list
    const existingNames = items.map(item => item.name.toLowerCase());
    const newSuggestions = suggestions.filter(
      suggestion => !existingNames.includes(suggestion.name.toLowerCase())
    );

    if (newSuggestions.length === 0) {
      toast({
        title: "No new suggestions",
        description: "You already have all common items!",
      });
      return;
    }

    const itemsToAdd = newSuggestions.slice(0, 3).map(suggestion => ({
      id: Date.now().toString() + Math.random(),
      name: suggestion.name,
      packed: false,
      category: suggestion.category,
    }));

    if (currentList) {
      const updatedItems = [...items, ...itemsToAdd];
      updateListMutation.mutate({ id: currentList.id, items: updatedItems });
    } else {
      createListMutation.mutate({
        name: 'My Packing List',
        tripId,
        items: itemsToAdd,
      });
    }

    toast({
      title: "Smart suggestions added",
      description: `Added ${itemsToAdd.length} recommended items`,
    });
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
              className={`flex-1 text-sm ${
                item.packed ? 'line-through text-ios-gray' : 'text-white'
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
