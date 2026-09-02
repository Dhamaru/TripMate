import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCurrencySymbol } from "@/lib/currency";
import { usePlaceSuggestions, type PlaceSuggestion } from "@/hooks/usePlaceSuggestions";
import { useTripDestinationCoords } from "@/hooks/useTripDestinationCoords";
import { PlaceSearchDropdown } from "@/components/PlaceSearchDropdown";
import { Loader2, Search, MapPin } from "lucide-react";

interface ActivityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: any; // Edit mode if activity is provided
  dayIndex: number;
  onSave: (activity: any) => void;
  currency?: string;
  // Biases the location search toward this trip's city — searching for
  // "restaurants" while planning a Tokyo trip should surface Tokyo
  // restaurants first, not whatever's nearest to wherever the planner
  // physically is right now.
  destination?: string;
}

export function ActivityFormDialog({
  open,
  onOpenChange,
  activity,
  dayIndex,
  onSave,
  currency,
  destination,
}: ActivityFormDialogProps) {
  const [formData, setFormData] = useState({
    title: "",
    time: "09:00 AM",
    placeName: "",
    address: "",
    type: "sightseeing",
    cost: 0,
    entryFee: 0,
    duration_minutes: 60,
    lat: undefined as number | undefined,
    lon: undefined as number | undefined,
    from: "",
    to: "",
    notes: "",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const biasCoords = useTripDestinationCoords(destination);
  const { suggestions, isLoading: isSearching } = usePlaceSuggestions(
    showSuggestions ? searchTerm : "",
    biasCoords,
  );

  // Pre-fill form if editing
  useEffect(() => {
    if (activity) {
      setFormData({
        title: activity.title || "",
        time: activity.time || "09:00 AM",
        placeName: activity.placeName || "",
        address: activity.address || "",
        type: activity.type || "sightseeing",
        cost: activity.cost || 0,
        entryFee: activity.entryFee || 0,
        duration_minutes: activity.duration_minutes || 60,
        lat: activity.lat,
        lon: activity.lon,
        from: activity.from || "",
        to: activity.to || "",
        notes: activity.notes || "",
      });
      setSearchTerm(activity.placeName || "");
    } else {
      // Reset for create mode
      setFormData({
        title: "",
        time: "09:00 AM",
        placeName: "",
        address: "",
        type: "sightseeing",
        cost: 0,
        entryFee: 0,
        duration_minutes: 60,
        lat: undefined,
        lon: undefined,
        from: "",
        to: "",
        notes: "",
      });
      setSearchTerm("");
    }
    setShowSuggestions(false);
  }, [activity, open]);

  const handleSearch = (val: string) => {
    setSearchTerm(val);
    setShowSuggestions(val.trim().length >= 3);
  };

  const selectPlace = (place: PlaceSuggestion) => {
    const name = place.name || place.display_name?.split(",")[0] || "";
    const addr = place.display_name || "";

    setFormData((prev) => ({
      ...prev,
      placeName: name,
      address: addr,
      lat: place.location?.lat,
      lon: place.location?.lng,
      title: prev.title || `Visit ${name}`,
    }));

    setSearchTerm(name);
    setShowSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      return;
    }
    onSave(formData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[90vh] flex flex-col shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-foreground text-xl font-bold">
            {activity ? "Edit Activity" : "Add Activity"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 pt-2">
          {/* Kept outside the scrollable body below (not just "space-y-4"
              inside it) so its suggestions dropdown is never clipped by
              overflow-y-auto — an absolutely-positioned descendant gets
              clipped by any ancestor with overflow set, and this field is
              a real-world case: a phone in landscape has just ~350-400px
              of dialog height, which the dropdown alone can approach. */}
          <div className="relative shrink-0">
            <Label
              htmlFor="placeSearch"
              className="text-foreground font-medium mb-1.5 flex items-center gap-2"
            >
              <MapPin className="w-4 h-4 text-[var(--explorer-blue)]" />
              Find Location
            </Label>
            <div className="relative">
              <Input
                id="placeSearch"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search for a place, restaurant, park..."
                className="bg-muted border-border text-foreground pl-10 h-11 focus:border-[var(--explorer-blue)] transition-all"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {isSearching ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
              </div>
            </div>

            <PlaceSearchDropdown
              suggestions={suggestions}
              isLoading={isSearching}
              visible={showSuggestions}
              onSelect={selectPlace}
            />
          </div>

          <div className="space-y-4 overflow-y-auto pt-2 min-h-0">
            <div className="pt-2 border-t border-border">
              <Label htmlFor="title" className="text-foreground font-medium mb-1.5 block">
                Activity Title *
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Visit Taj Mahal"
                className="bg-muted border-border text-foreground h-11"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="time" className="text-foreground font-medium mb-1.5 block">
                  Time
                </Label>
                <Input
                  id="time"
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="bg-muted border-border text-foreground h-11"
                />
              </div>
              <div>
                <Label htmlFor="duration" className="text-foreground font-medium mb-1.5 block">
                  Duration (min)
                </Label>
                <Input
                  id="duration"
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 60 })
                  }
                  className="bg-muted border-border text-foreground h-11"
                />
              </div>
            </div>

            <div className="hidden">
              <Label htmlFor="placeName" className="text-foreground">
                Place Name
              </Label>
              <Input
                id="placeName"
                value={formData.placeName}
                onChange={(e) => setFormData({ ...formData, placeName: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="address" className="text-foreground font-medium mb-1.5 block">
                Address
              </Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Full address (auto-filled if location selected)"
                className="bg-muted border-border text-foreground min-h-[80px]"
                rows={2}
              />
              {formData.lat && (
                <div className="text-[10px] text-[var(--explorer-blue)] mt-1 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--explorer-blue)] animate-pulse" />
                  Coordinates captured: {formData.lat.toFixed(4)}, {formData.lon?.toFixed(4)}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="type" className="text-foreground font-medium mb-1.5 block">
                Type
              </Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger className="bg-muted border-border text-foreground h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border shadow-2xl">
                  <SelectItem value="sightseeing" className="text-foreground">
                    Sightseeing
                  </SelectItem>
                  <SelectItem value="restaurant" className="text-foreground">
                    Restaurant
                  </SelectItem>
                  <SelectItem value="hotel" className="text-foreground">
                    Hotel / Stay
                  </SelectItem>
                  <SelectItem value="travel" className="text-foreground">
                    Travel Leg (Flight / Drive / Trek)
                  </SelectItem>
                  <SelectItem value="transport" className="text-foreground">
                    Local Transport
                  </SelectItem>
                  <SelectItem value="shopping" className="text-foreground">
                    Shopping
                  </SelectItem>
                  <SelectItem value="other" className="text-foreground">
                    Other
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From / To fields for travel legs */}
            {formData.type === "travel" && (
              <div className="grid grid-cols-2 gap-4 p-3 bg-[rgb(var(--explorer-blue-rgb)/5%)] border border-[rgb(var(--explorer-blue-rgb)/20%)] rounded-lg">
                <div>
                  <Label className="text-foreground font-medium mb-1.5 block">From</Label>
                  <Input
                    value={formData.from}
                    onChange={(e) => setFormData({ ...formData, from: e.target.value })}
                    placeholder="e.g. Hyderabad"
                    className="bg-muted border-border text-foreground h-10"
                  />
                </div>
                <div>
                  <Label className="text-foreground font-medium mb-1.5 block">To</Label>
                  <Input
                    value={formData.to}
                    onChange={(e) => setFormData({ ...formData, to: e.target.value })}
                    placeholder="e.g. Delhi"
                    className="bg-muted border-border text-foreground h-10"
                  />
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <Label className="text-foreground font-medium mb-1.5 block">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional details..."
                className="bg-muted border-border text-foreground min-h-[60px]"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cost" className="text-foreground font-medium mb-1.5 block">
                  Est. Cost
                </Label>
                <Input
                  id="cost"
                  type="number"
                  value={formData.cost}
                  onChange={(e) =>
                    setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })
                  }
                  className="bg-muted border-border text-foreground h-11"
                />
              </div>
              <div>
                <Label htmlFor="entryFee" className="text-foreground font-medium mb-1.5 block">
                  Entry Fee ({getCurrencySymbol(currency)})
                </Label>
                <Input
                  id="entryFee"
                  type="number"
                  value={formData.entryFee}
                  onChange={(e) =>
                    setFormData({ ...formData, entryFee: parseFloat(e.target.value) || 0 })
                  }
                  className="bg-muted border-border text-foreground h-11"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="destructive"
                onClick={() => onOpenChange(false)}
                className="flex-1 bg-transparent hover:bg-destructive/10 border border-destructive/50 text-destructive h-12"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-[var(--explorer-blue)] hover:bg-[var(--explorer-blue-deep)] h-12 font-bold border border-[var(--explorer-blue)]"
              >
                {activity ? "Update" : "Add"} Activity
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
