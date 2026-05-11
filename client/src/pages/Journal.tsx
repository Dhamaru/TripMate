import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import type { JournalEntry, User } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Calendar, Clock, Image as ImageIcon, Plus, Book, Mic, Sparkles } from "lucide-react";

const JournalImageCarousel = ({ photos, title, children, height = "h-48" }: { photos: string[], title: string, children?: React.ReactNode, height?: string }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % photos.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [photos.length]);

  if (!photos || photos.length === 0) {
    return (
      <div className={`${height} overflow-hidden relative bg-gray-100 flex items-center justify-center`}>
        <ImageIcon className="text-muted-foreground w-8 h-8" />
        {children}
      </div>
    );
  }

  return (
    <div className={`${height} overflow-hidden relative bg-gray-100`}>
      <AnimatePresence mode="wait">
        <motion.img
          key={photos[index]}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          src={photos[index]}
          alt={`${title} ${index + 1}`}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      </AnimatePresence>
      <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
      {photos.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {photos.map((_, i) => (
            <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === index ? 'bg-card w-4' : 'bg-card/40 w-1'}`} />
          ))}
        </div>
      )}
      {children}
    </div>
  );
};

export default function Journal() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth() as { user: User | undefined; isLoading: boolean; isAuthenticated: boolean };
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const fileInputRef = useState<{ current: HTMLInputElement | null }>({ current: null })[0];
  const [entryForm, setEntryForm] = useState({ title: "", content: "", location: "", latitude: "", longitude: "" });
  const [photos, setPhotos] = useState<FileList | null>(null);
  const [keptPhotos, setKeptPhotos] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isAugmenting, setIsAugmenting] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({ title: "Unauthorized", description: "You are logged out. Redirecting to login…", variant: "destructive" });
      const t = setTimeout(() => navigate("/signin", { replace: true }), 400);
      return () => clearTimeout(t);
    }
  }, [isAuthenticated, authLoading, toast, navigate]);

  const { data: journalEntries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/v1/journal"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/journal?light=true");
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const handleUnauthorized = () => {
    toast({ title: "Unauthorized", description: "Your session expired. Please log in again.", variant: "destructive" });
    setTimeout(() => navigate("/signin", { replace: true }), 400);
  };

  const createEntryMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest("POST", "/api/v1/journal", formData);
      if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/journal"] });
      toast({ title: "Entry Created", description: "Journal entry saved successfully." });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) return void handleUnauthorized();
      toast({ title: "Error", description: "Failed to create journal entry.", variant: "destructive" });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<JournalEntry> }) => {
      const res = await apiRequest("PUT", `/api/v1/journal/${data.id}`, data.updates);
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/journal"] });
      toast({ title: "Entry Updated" });
      setEditingEntry(null);
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) return void handleUnauthorized();
      toast({ title: "Error", description: "Failed to update journal entry.", variant: "destructive" });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/v1/journal/${id}`);
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/journal"] });
      toast({ title: "Entry Deleted" });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) return void handleUnauthorized();
      toast({ title: "Error", description: "Failed to delete journal entry.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setEntryForm({ title: "", content: "", location: "", latitude: "", longitude: "" });
    setPhotos(null);
    setKeptPhotos([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAiEnhance = async () => {
    if (!entryForm.content.trim()) {
      toast({ title: "No content", description: "Write something first for AI to enhance!", variant: "destructive" });
      return;
    }
    setIsAugmenting(true);
    try {
      const res = await apiRequest('POST', '/api/v1/journal/augment', { content: entryForm.content, destination: entryForm.location });
      const data = await res.json();
      setEntryForm(prev => ({
        ...prev,
        content: data.augmentedContent,
        title: prev.title || (data.suggestedLabels?.[0] ? `My ${data.suggestedLabels[0]} Trip` : prev.title)
      }));
      toast({ title: "Entry Enhanced!", description: `Tone: ${data.sentiment}` });
    } catch {
      toast({ title: "AI Error", description: "Failed to enhance entry.", variant: "destructive" });
    } finally {
      setIsAugmenting(false);
    }
  };

  const startListening = () => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setEntryForm(prev => ({ ...prev, content: (prev.content + " " + transcript).trim() }));
      };
      recognition.start();
    } else {
      toast({ title: "Not Supported", description: "Voice recognition not supported in this browser.", variant: "destructive" });
    }
  };

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
    if (photos) Array.from(photos).forEach(file => formData.append('photos', file));

    if (editingEntry) {
      if (keptPhotos.length > 0) formData.append('existingPhotos', JSON.stringify(keptPhotos));
      else formData.append('existingPhotos', JSON.stringify([]));
      updateEntryMutation.mutate({ id: editingEntry.id, updates: formData as any });
    } else {
      createEntryMutation.mutate(formData);
    }
  };

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setEntryForm({ title: entry.title, content: entry.content, location: entry.location || "", latitude: entry.latitude?.toString() || "", longitude: entry.longitude?.toString() || "" });
    setKeptPhotos(entry.photos || []);
    setPhotos(null);
    setIsCreateDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Delete this journal entry?")) deleteEntryMutation.mutate(id);
  };

  const handleCancel = () => {
    if (editingEntry) {
      setEntryForm({ title: editingEntry.title, content: editingEntry.content, location: editingEntry.location || "", latitude: editingEntry.latitude?.toString() || "", longitude: editingEntry.longitude?.toString() || "" });
      setKeptPhotos(editingEntry.photos || []);
      setPhotos(null);
    }
    setIsCreateDialogOpen(false);
    setEditingEntry(null);
    resetForm();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Travel Journal</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Capture your travel memories and experiences</p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl gap-2"
              data-testid="button-new-entry"
              onClick={() => { setEditingEntry(null); resetForm(); }}
            >
              <Plus className="h-4 w-4" /> New Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingEntry ? 'Edit Journal Entry' : 'New Journal Entry'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="journal-entry-form">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={entryForm.title}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter a title for your journal entry"
                  className="bg-muted/50 border text-foreground placeholder:text-muted-foreground focus-visible:ring-amber-500/30"
                  required
                  data-testid="input-title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Location</label>
                <Input
                  type="text"
                  value={entryForm.location}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Where was this memory made?"
                  className="bg-muted/50 border text-foreground placeholder:text-muted-foreground"
                  data-testid="input-location"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-sm font-medium text-foreground">
                    Content <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={handleAiEnhance} disabled={isAugmenting} className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-7 text-xs gap-1">
                      <Sparkles className="w-3 h-3" />
                      {isAugmenting ? 'Enhancing…' : 'AI Enhance'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={startListening} className={`h-7 text-xs gap-1 ${isListening ? 'text-red-500 animate-pulse' : 'text-[#1E3A8A] hover:bg-blue-50'}`}>
                      <Mic className="w-3 h-3" />
                      {isListening ? 'Listening…' : 'Dictate'}
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={entryForm.content}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Share your travel experience, thoughts, and memories…"
                  className="bg-muted/50 border text-foreground placeholder:text-muted-foreground min-h-[140px] focus-visible:ring-amber-500/30"
                  required
                  data-testid="textarea-content"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Photos</label>
                <Input
                  ref={(el) => { if (el) fileInputRef.current = el; }}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setPhotos(e.target.files)}
                  className="bg-muted/50 border text-foreground file:bg-amber-500 file:text-white file:border-0 file:rounded-md file:px-2 file:py-1 file:mr-2 file:hover:bg-amber-600 cursor-pointer"
                />
                {photos && photos.length > 0 && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm text-amber-700 font-semibold mb-1">{photos.length} file{photos.length > 1 ? 's' : ''} selected</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {Array.from(photos).map((file, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-emerald-500">✓</span>
                          <span className="truncate">{file.name}</span>
                          <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {keptPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {keptPhotos.map((photo, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group border border">
                        <img src={photo} alt={`Existing ${i}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setKeptPhotos(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-0 right-0 p-1 bg-red-500/80 text-white rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" onClick={handleCancel} variant="outline" className="flex-1 border text-muted-foreground hover:bg-muted/50" data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={createEntryMutation.isPending || updateEntryMutation.isPending} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" data-testid="button-save">
                  {(createEntryMutation.isPending || updateEntryMutation.isPending) ? 'Saving…' : (editingEntry ? 'Update Entry' : 'Save Entry')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Entries */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500" />
        </div>
      ) : journalEntries && journalEntries.length > 0 ? (
        <div className="relative border-l-2 border ml-4 md:ml-8 space-y-8 pb-12">
          {Object.entries(
            journalEntries.reduce((acc, entry) => {
              const date = new Date(entry.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
              if (!acc[date]) acc[date] = [];
              acc[date].push(entry);
              return acc;
            }, {} as Record<string, JournalEntry[]>)
          ).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()).map(([date, entries]) => (
            <div key={date} className="relative pl-6 md:pl-10">
              <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-amber-500 border-4 border-white shadow-sm" />
              <h3 className="text-base font-semibold text-foreground mb-4 opacity-70">{date}</h3>
              <div className="grid grid-cols-1 gap-4">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-card rounded-3xl border border hover:border-amber-300/50 hover:shadow-md transition-all cursor-pointer group overflow-hidden"
                    onClick={() => navigate(`/app/journal/${entry.id}`)}
                  >
                    <div className="flex flex-row h-32 sm:h-40">
                      <div className="w-1/3 min-w-[100px] border-r border-gray-50 flex-shrink-0">
                        {entry.photos && entry.photos.length > 0 ? (
                          <JournalImageCarousel photos={entry.photos} title={entry.title} height="h-full">
                            <div className="absolute top-1 right-1 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                              <Button onClick={(e) => { e.stopPropagation(); handleEdit(entry); }} size="sm" variant="ghost" className="h-6 w-6 bg-black/40 text-white hover:bg-black/60 rounded-full p-0 text-xs">✎</Button>
                              <Button onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }} size="sm" variant="ghost" className="h-6 w-6 bg-red-500/50 text-white hover:bg-red-600/70 rounded-full p-0 text-xs">✕</Button>
                            </div>
                          </JournalImageCarousel>
                        ) : (
                          <div className="h-full bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center relative">
                            <ImageIcon className="w-6 h-6 text-amber-300" />
                            <div className="absolute top-1 right-1 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button onClick={(e) => { e.stopPropagation(); handleEdit(entry); }} size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:bg-gray-100/50 text-xs">✎</Button>
                              <Button onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }} size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:bg-red-50 text-xs">✕</Button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="w-2/3 p-3 sm:p-4 flex flex-col justify-between overflow-hidden">
                        <div>
                          <div className="flex justify-between items-start mb-1 gap-2">
                            <h4 className="font-bold text-foreground text-sm sm:text-base truncate">{entry.title}</h4>
                            {entry.location && (
                              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex-shrink-0 flex items-center border border-amber-200">
                                <MapPin className="w-2.5 h-2.5 mr-1" />
                                <span className="truncate max-w-[80px]">{entry.location}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-3 whitespace-pre-wrap leading-relaxed">
                            {entry.content}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(entry.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-3xl border border p-16 text-center" data-testid="no-journal-entries">
          <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-5">
            <Book className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Start Your Travel Journal</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
            Document your adventures, capture memories, and create a beautiful record of your travels.
          </p>
          <Button
            onClick={() => { setEditingEntry(null); resetForm(); setIsCreateDialogOpen(true); }}
            className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl gap-2"
            data-testid="button-create-first-entry"
          >
            <Plus className="h-4 w-4" /> Create Your First Entry
          </Button>
        </div>
      )}
    </div>
  );
}
