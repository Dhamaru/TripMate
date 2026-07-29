import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import type { JournalEntry, User } from "@shared/schema";
import { ChevronLeft, Edit, Trash2, MapPin, Calendar, Clock, Share2 } from "lucide-react";
import { motion } from "framer-motion";

export default function JournalDetail() {
    const { id } = useParams<{ id: string }>();
    const [, navigate] = useLocation();
    const { isLoading: authLoading, isAuthenticated } = useAuth() as { user: User | undefined; isLoading: boolean; isAuthenticated: boolean };
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activePhotoIndex, setActivePhotoIndex] = useState(0);

    const { data: entry, isLoading: entryLoading, error } = useQuery<JournalEntry>({
        queryKey: [`/api/v1/journal/${id}`],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/v1/journal/${id}`);
            if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
            return res.json();
        },
        enabled: !!id && isAuthenticated,
    });

    const [isEditing, setIsEditing] = useState(false);
    const [entryForm, setEntryForm] = useState({
        title: "",
        content: "",
        location: "",
        latitude: "",
        longitude: "",
    });
    const [photos, setPhotos] = useState<FileList | null>(null);
    const [keptPhotos, setKeptPhotos] = useState<string[]>([]);

    useEffect(() => {
        if (entry) {
            setEntryForm({
                title: entry.title,
                content: entry.content,
                location: entry.location || "",
                latitude: entry.latitude?.toString() || "",
                longitude: entry.longitude?.toString() || "",
            });
            setKeptPhotos(entry.photos || []);
        }
    }, [entry]);

    // Auto-advance photo carousel
    useEffect(() => {
        const photos = entry?.photos;
        if (!photos || photos.length <= 1 || isEditing) return;

        const photoCount = photos.length;
        const interval = setInterval(() => {
            setActivePhotoIndex(prev => (prev + 1) % photoCount);
        }, 4000); // 4 seconds per slide

        return () => clearInterval(interval);
    }, [entry?.photos, isEditing]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    const deleteEntryMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await apiRequest("DELETE", `/api/v1/journal/${id}`);
            if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
            return true;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/journal"] });
            toast({ title: "Entry Deleted", description: "Your journal entry has been deleted." });
            navigate("/app/journal");
        },
        onError: (error) => {
            if (isUnauthorizedError(error)) {
                toast({ title: "Unauthorized", description: "Your session expired. Please log in again.", variant: "destructive" });
                navigate("/signin");
                return;
            }
            toast({ title: "Error", description: "Failed to delete journal entry.", variant: "destructive" });
        },
    });

    const updateEntryMutation = useMutation({
        mutationFn: async (formData: FormData) => {
            const res = await apiRequest("PUT", `/api/v1/journal/${id}`, formData);
            if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/v1/journal/${id}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/v1/journal"] });
            toast({ title: "Entry Updated", description: "Your journal entry has been updated successfully." });
            setIsEditing(false);
        },
        onError: (error) => {
            if (isUnauthorizedError(error)) {
                toast({ title: "Unauthorized", description: "Your session expired. Please log in again.", variant: "destructive" });
                navigate("/signin");
                return;
            }
            toast({ title: "Error", description: "Failed to update journal entry.", variant: "destructive" });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!entryForm.title.trim() || !entryForm.content.trim()) {
            toast({ title: "Missing Information", description: "Please fill in the title and content.", variant: "destructive" });
            return;
        }

        const formData = new FormData();
        formData.append("title", entryForm.title);
        formData.append("content", entryForm.content);
        if (entryForm.location) formData.append("location", entryForm.location);
        if (entryForm.latitude) formData.append("latitude", entryForm.latitude);
        if (entryForm.longitude) formData.append("longitude", entryForm.longitude);
        if (photos) {
            Array.from(photos).forEach(file => formData.append('photos', file));
        }
        formData.append('existingPhotos', JSON.stringify(keptPhotos));

        updateEntryMutation.mutate(formData);
    };

    if (authLoading || entryLoading) {
        return (
            <div className=" flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1D4E89] mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading memory...</p>
                </div>
            </div>
        );
    }

    if (error || !entry) {
        return (
            <div className=" flex items-center justify-center p-4">
                <Card className="bg-card border max-w-md w-full">
                    <CardContent className="p-8 text-center">
                        <div className="text-red-500 mb-4">
                            <Trash2 className="w-12 h-12 mx-auto" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground mb-2">Memory Not Found</h2>
                        <p className="text-muted-foreground mb-6">The journal entry you're looking for doesn't exist or has been removed.</p>
                        <Button onClick={() => navigate("/app/journal")} className="bg-[#1D4E89] w-full">
                            Back to Journal
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const handleShare = () => {
        const shareData = {
            title: entry.title,
            text: entry.content,
            url: window.location.href
        };
        if (navigator.share) {
            navigator.share(shareData).catch(() => { });
        } else {
            navigator.clipboard.writeText(window.location.href);
            toast({ title: "Link Copied", description: "Link copied to clipboard!" });
        }
    };

    return (
        <div className=" pb-20">
            <div className="max-w-4xl mx-auto px-4 py-6">
                {/* Top Navigation */}
                <div className="flex items-center justify-between mb-6">
                    <Button
                        variant="ghost"
                        onClick={() => navigate("/app/journal")}
                        className="text-muted-foreground hover:text-foreground p-0 h-auto hover:bg-transparent"
                    >
                        <ChevronLeft className="w-5 h-5 mr-1" />
                        Back to Journal
                    </Button>

                    <div className="flex items-center gap-2">
                        {!isEditing && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleShare}
                                    className="bg-card border text-foreground hover:bg-gray-100"
                                >
                                    <Share2 className="w-4 h-4 mr-2" />
                                    Share
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsEditing(true)}
                                    className="bg-card border text-foreground hover:bg-gray-100"
                                >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        if (window.confirm("Delete this memory forever?")) {
                                            deleteEntryMutation.mutate(entry.id);
                                        }
                                    }}
                                    className="bg-card border-red-400 text-red-500 hover:bg-red-500 hover:text-white"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {isEditing ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <Card className="bg-card border shadow-xl rounded-3xl overflow-hidden mb-8">
                            <CardHeader>
                                <CardTitle className="text-foreground">Edit Memory</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Title</label>
                                        <input
                                            type="text"
                                            value={entryForm.title}
                                            onChange={(e) => setEntryForm(prev => ({ ...prev, title: e.target.value }))}
                                            className="w-full bg-muted/50 border border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D4E89]"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Location</label>
                                        <input
                                            type="text"
                                            value={entryForm.location}
                                            onChange={(e) => setEntryForm(prev => ({ ...prev, location: e.target.value }))}
                                            className="w-full bg-muted/50 border border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D4E89]"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Content</label>
                                        <textarea
                                            value={entryForm.content}
                                            onChange={(e) => setEntryForm(prev => ({ ...prev, content: e.target.value }))}
                                            className="w-full bg-muted/50 border border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D4E89] min-h-[200px]"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Add Photos</label>
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*"
                                            onChange={(e) => setPhotos(e.target.files)}
                                            className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#1D4E89] file:text-white hover:file:bg-blue-600"
                                        />
                                    </div>
                                    {keptPhotos.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {keptPhotos.map((photo, i) => (
                                                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                                                    <img src={photo} alt="" className="w-full h-full object-cover" />
                                                    <button
                                                        type="button"
                                                        onClick={() => setKeptPhotos(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="absolute top-1 right-1 bg-red-600/80 p-1 rounded-full text-white"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex gap-4 pt-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setIsEditing(false)}
                                            className="flex-1 border text-foreground"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={updateEntryMutation.isPending}
                                            className="flex-1 bg-[#163F73] hover:bg-[#0F2C52] text-white"
                                        >
                                            {updateEntryMutation.isPending ? "Saving..." : "Save Changes"}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </motion.div>
                ) : (
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {/* Hero Section - Photos */}
                        {entry.photos && entry.photos.length > 0 ? (
                            <motion.div
                                variants={itemVariants}
                                className="relative h-64 md:h-96 rounded-3xl overflow-hidden mb-8 shadow-2xl"
                            >
                                <motion.img
                                    key={activePhotoIndex}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 1 }}
                                    src={entry.photos[activePhotoIndex]}
                                    alt={entry.title}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

                                {entry.photos.length > 1 && (
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                                        {entry.photos.map((_, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setActivePhotoIndex(i)}
                                                className={`w-2 h-2 rounded-full transition-all ${i === activePhotoIndex ? 'bg-card w-4' : 'bg-card/40'}`}
                                            />
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                variants={itemVariants}
                                className="h-48 md:h-64 rounded-3xl bg-gradient-to-br from-[#1D4E89] to-blue-700 flex items-center justify-center mb-8 shadow-xl"
                            >
                                <MapPin className="w-16 h-16 text-white/50" />
                            </motion.div>
                        )}

                        {/* Header Info */}
                        <div className="mb-8">
                            <motion.h1 variants={itemVariants} className="text-3xl md:text-5xl font-bold text-foreground mb-4">{entry.title}</motion.h1>

                            <div className="flex flex-wrap gap-4 text-muted-foreground">
                                {entry.location && (
                                    <motion.div variants={itemVariants} className="flex items-center bg-card px-3 py-1.5 rounded-full border border">
                                        <MapPin className="w-4 h-4 mr-2 text-[#1D4E89]" />
                                        <span className="text-sm font-medium text-foreground">{entry.location}</span>
                                    </motion.div>
                                )}
                                <motion.div variants={itemVariants} className="flex items-center bg-card px-3 py-1.5 rounded-full border border">
                                    <Calendar className="w-4 h-4 mr-2 text-amber-500" />
                                    <span className="text-sm font-medium text-foreground">
                                        {new Date(entry.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                    </span>
                                </motion.div>
                                <motion.div variants={itemVariants} className="flex items-center bg-card px-3 py-1.5 rounded-full border border">
                                    <Clock className="w-4 h-4 mr-2 text-emerald-500" />
                                    <span className="text-sm font-medium text-foreground">
                                        {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </motion.div>
                            </div>
                        </div>

                        {/* Large Content Section */}
                        <motion.div variants={itemVariants}>
                            <Card className="bg-card border shadow-xl rounded-3xl overflow-hidden backdrop-blur-sm bg-opacity-80">
                                <CardContent className="p-6 md:p-10">
                                    <div className="prose prose-invert max-w-none text-lg leading-relaxed text-foreground whitespace-pre-wrap">
                                        {entry.content}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
