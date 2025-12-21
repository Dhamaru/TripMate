import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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
    });

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
            });
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
            });
        }
    }, [activity, open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-ios-card border-ios-gray text-white max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-white">
                        {activity ? 'Edit Activity' : 'Add Activity'}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="title" className="text-white">Title *</Label>
                        <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="e.g., Visit Taj Mahal"
                            className="bg-ios-darker border-ios-gray text-white"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="time" className="text-white">Time</Label>
                            <Input
                                id="time"
                                type="time"
                                value={formData.time}
                                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                className="bg-ios-darker border-ios-gray text-white"
                            />
                        </div>
                        <div>
                            <Label htmlFor="duration" className="text-white">Duration (min)</Label>
                            <Input
                                id="duration"
                                type="number"
                                value={formData.duration_minutes}
                                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 60 })}
                                className="bg-ios-darker border-ios-gray text-white"
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="placeName" className="text-white">Place Name</Label>
                        <Input
                            id="placeName"
                            value={formData.placeName}
                            onChange={(e) => setFormData({ ...formData, placeName: e.target.value })}
                            placeholder="e.g., Taj Mahal"
                            className="bg-ios-darker border-ios-gray text-white"
                        />
                    </div>

                    <div>
                        <Label htmlFor="address" className="text-white">Address</Label>
                        <Textarea
                            id="address"
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Full address"
                            className="bg-ios-darker border-ios-gray text-white"
                            rows={2}
                        />
                    </div>

                    <div>
                        <Label htmlFor="type" className="text-white">Type</Label>
                        <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                            <SelectTrigger className="bg-ios-darker border-ios-gray text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-ios-card border-ios-gray">
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
                            <Label htmlFor="cost" className="text-white">Estimated Cost ($)</Label>
                            <Input
                                id="cost"
                                type="number"
                                value={formData.cost}
                                onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                                className="bg-ios-darker border-ios-gray text-white"
                            />
                        </div>
                        <div>
                            <Label htmlFor="entryFee" className="text-white">Entry Fee ($)</Label>
                            <Input
                                id="entryFee"
                                type="number"
                                value={formData.entryFee}
                                onChange={(e) => setFormData({ ...formData, entryFee: parseFloat(e.target.value) || 0 })}
                                className="bg-ios-darker border-ios-gray text-white"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 bg-ios-blue hover:bg-blue-600"
                        >
                            {activity ? 'Update' : 'Add'} Activity
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
