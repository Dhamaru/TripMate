import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, Search, MapPin } from 'lucide-react';

interface ActivityFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activity?: any; // Edit mode if activity is provided
    dayIndex: number;
    onSave: (activity: any) => void;
}

export function ActivityFormDialog({ open, onOpenChange, activity, dayIndex, onSave }: ActivityFormDialogProps) {
    const [formData, setFormData] = useState({
        title: '',
        time: '09:00 AM',
        placeName: '',
        address: '',
        type: 'sightseeing',
        cost: 0,
        entryFee: 0,
        duration_minutes: 60,
        lat: undefined as number | undefined,
        lon: undefined as number | undefined,
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Pre-fill form if editing
    useEffect(() => {
        if (activity) {
            setFormData({
                title: activity.title || '',
                time: activity.time || '09:00 AM',
                placeName: activity.placeName || '',
                address: activity.address || '',
                type: activity.type || 'sightseeing',
                cost: activity.cost || 0,
                entryFee: activity.entryFee || 0,
                duration_minutes: activity.duration_minutes || 60,
                lat: activity.lat,
                lon: activity.lon,
            });
            setSearchTerm(activity.placeName || '');
        } else {
            // Reset for create mode
            setFormData({
                title: '',
                time: '09:00 AM',
                placeName: '',
                address: '',
                type: 'sightseeing',
                cost: 0,
                entryFee: 0,
                duration_minutes: 60,
                lat: undefined,
                lon: undefined,
            });
            setSearchTerm('');
        }
        setSuggestions([]);
        setShowSuggestions(false);
    }, [activity, open]);

    const handleSearch = async (val: string) => {
        setSearchTerm(val);
        if (!val.trim() || val.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await apiRequest('GET', `/api/v1/places/search?query=${encodeURIComponent(val)}&pageSize=5`);
                const data = await res.json();
                const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
                setSuggestions(items);
                setShowSuggestions(items.length > 0);
            } catch (err) {
                console.error("Place search error:", err);
            } finally {
                setIsSearching(false);
            }
        }, 500);
    };

    const selectPlace = (place: any) => {
        const name = place.name || place.display_name?.split(',')[0] || '';
        const addr = place.display_name || '';

        setFormData(prev => ({
            ...prev,
            placeName: name,
            address: addr,
            lat: Number(place.lat),
            lon: Number(place.lon),
            title: prev.title || `Visit ${name}`
        }));

        setSearchTerm(name);
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-ios-card border-ios-gray text-white max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="text-white text-xl font-bold">
                        {activity ? 'Edit Activity' : 'Add Activity'}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="relative">
                        <Label htmlFor="placeSearch" className="text-white font-medium mb-1.5 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-ios-blue" />
                            Find Location
                        </Label>
                        <div className="relative">
                            <Input
                                id="placeSearch"
                                value={searchTerm}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Search for a place, restaurant, park..."
                                className="bg-ios-darker border-ios-gray/50 text-white pl-10 h-11 focus:border-ios-blue transition-all"
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ios-gray">
                                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                            </div>
                        </div>

                        {showSuggestions && (
                            <div className="absolute z-50 left-0 right-0 mt-1 bg-ios-darker border border-ios-gray/50 rounded-lg shadow-2xl overflow-hidden backdrop-blur-xl">
                                {suggestions.map((p, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => selectPlace(p)}
                                        className="w-full text-left px-4 py-3 hover:bg-ios-blue/10 border-b border-ios-gray/20 last:border-0 transition-colors group"
                                    >
                                        <div className="font-medium text-white group-hover:text-ios-blue transition-colors">
                                            {p.name || p.display_name?.split(',')[0]}
                                        </div>
                                        <div className="text-xs text-ios-gray truncate mt-0.5">
                                            {p.display_name}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="pt-2 border-t border-ios-gray/20">
                        <Label htmlFor="title" className="text-white font-medium mb-1.5 block">Activity Title *</Label>
                        <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="e.g., Visit Taj Mahal"
                            className="bg-ios-darker border-ios-gray/50 text-white h-11"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="time" className="text-white font-medium mb-1.5 block">Time</Label>
                            <Input
                                id="time"
                                type="time"
                                value={formData.time}
                                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                className="bg-ios-darker border-ios-gray/50 text-white h-11"
                            />
                        </div>
                        <div>
                            <Label htmlFor="duration" className="text-white font-medium mb-1.5 block">Duration (min)</Label>
                            <Input
                                id="duration"
                                type="number"
                                value={formData.duration_minutes}
                                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 60 })}
                                className="bg-ios-darker border-ios-gray/50 text-white h-11"
                            />
                        </div>
                    </div>

                    <div className="hidden">
                        <Label htmlFor="placeName" className="text-white">Place Name</Label>
                        <Input
                            id="placeName"
                            value={formData.placeName}
                            onChange={(e) => setFormData({ ...formData, placeName: e.target.value })}
                        />
                    </div>

                    <div>
                        <Label htmlFor="address" className="text-white font-medium mb-1.5 block">Address</Label>
                        <Textarea
                            id="address"
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Full address (auto-filled if location selected)"
                            className="bg-ios-darker border-ios-gray/50 text-white min-h-[80px]"
                            rows={2}
                        />
                        {formData.lat && (
                            <div className="text-[10px] text-ios-blue mt-1 flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-ios-blue animate-pulse" />
                                Coordinates captured: {formData.lat.toFixed(4)}, {formData.lon?.toFixed(4)}
                            </div>
                        )}
                    </div>

                    <div>
                        <Label htmlFor="type" className="text-white font-medium mb-1.5 block">Type</Label>
                        <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                            <SelectTrigger className="bg-ios-darker border-ios-gray/50 text-white h-11">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-ios-card border-ios-gray shadow-2xl">
                                <SelectItem value="sightseeing" className="text-white">Sightseeing</SelectItem>
                                <SelectItem value="restaurant" className="text-white">Restaurant</SelectItem>
                                <SelectItem value="hotel" className="text-white">Hotel</SelectItem>
                                <SelectItem value="transport" className="text-white">Transport</SelectItem>
                                <SelectItem value="shopping" className="text-white">Shopping</SelectItem>
                                <SelectItem value="other" className="text-white">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="cost" className="text-white font-medium mb-1.5 block">Est. Cost ($)</Label>
                            <Input
                                id="cost"
                                type="number"
                                value={formData.cost}
                                onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                                className="bg-ios-darker border-ios-gray/50 text-white h-11"
                            />
                        </div>
                        <div>
                            <Label htmlFor="entryFee" className="text-white font-medium mb-1.5 block">Entry Fee ($)</Label>
                            <Input
                                id="entryFee"
                                type="number"
                                value={formData.entryFee}
                                onChange={(e) => setFormData({ ...formData, entryFee: parseFloat(e.target.value) || 0 })}
                                className="bg-ios-darker border-ios-gray/50 text-white h-11"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 bg-transparent hover:bg-ios-red/10 border border-ios-red/50 text-ios-red h-12"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 bg-gradient-to-r from-ios-blue to-blue-600 hover:opacity-90 h-12 font-bold shadow-lg shadow-ios-blue/20"
                        >
                            {activity ? 'Update' : 'Add'} Activity
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
