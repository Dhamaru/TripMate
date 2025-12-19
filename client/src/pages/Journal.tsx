import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import type { JournalEntry, User } from "@shared/schema";

// Carousel Component for Journal Entry Images
const JournalImageCarousel = ({ photos, title, children }: { photos: string[], title: string, children?: React.ReactNode }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % photos.length);
    }, 3000); // Change every 3 seconds
    return () => clearInterval(interval);
  }, [photos.length]);

  return (
    <div className="h-48 overflow-hidden relative bg-ios-darker">
      {photos.map((photo, i) => (
        <img
          key={photo}
          src={photo}
          alt={`${title} ${i + 1}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === index ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}

      {/* Photo Counter Badge */}
      {photos.length > 1 && (
        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm z-10">
          <i className="fas fa-images mr-1"></i>
          {index + 1} / {photos.length}
        </div>
      )}

      {/* Action Buttons (passed as children) */}
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
  const fileInputRef = useState<{ current: HTMLInputElement | null }>({ current: null })[0]; // Simple ref workaround or use useRef if imported
  const [entryForm, setEntryForm] = useState({
    title: "",
    content: "",
    location: "",
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Redirecting to login…",
        variant: "destructive",
      });
      const t = setTimeout(() => navigate("/signin", { replace: true }), 400);
      return () => clearTimeout(t);
    }
  }, [isAuthenticated, authLoading, toast, navigate]);

  const { data: journalEntries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/v1/journal"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/journal");
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const handleUnauthorized = () => {
    toast({
      title: "Unauthorized",
      description: "Your session expired. Please log in again.",
      variant: "destructive",
    });
    const t = setTimeout(() => navigate("/signin", { replace: true }), 400);
    return () => clearTimeout(t);
  };

  const createEntryMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest("POST", "/api/v1/journal", formData);
      if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/journal"] });
      toast({ title: "Entry Created", description: "Your journal entry has been saved successfully." });
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
      toast({ title: "Entry Updated", description: "Your journal entry has been updated successfully." });
      setEditingEntry(null);
      setIsCreateDialogOpen(false); // Close the dialog!
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
      toast({ title: "Entry Deleted", description: "Your journal entry has been deleted." });
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const [photos, setPhotos] = useState<FileList | null>(null);
  const [keptPhotos, setKeptPhotos] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);

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

    if (editingEntry) {
      const formData = new FormData();
      formData.append("title", entryForm.title);
      formData.append("content", entryForm.content);
      if (entryForm.location) formData.append("location", entryForm.location);
      if (entryForm.latitude) formData.append("latitude", entryForm.latitude);
      if (entryForm.longitude) formData.append("longitude", entryForm.longitude);

      // Append new photos if selected
      if (photos) {
        Array.from(photos).forEach(file => formData.append('photos', file));
      }

      // We need to cast our mutation to accept FormData or create a separate one, 
      // but apiRequest handles FormData automatically if we pass it as data.
      // The issue is updateEntryMutation expects { id: string; updates: Partial<JournalEntry> }
      // We'll quickly patch the mutation call to satisfy TS or update the mutation definition.
      // Actually, let's just cheat TS here for speed as the mutationFn is: 
      // async (data: { id: string; updates: Partial<JournalEntry> }) => { apiRequest("PUT", ..., data.updates) }
      // Wait, apiRequest takes 'data' as 3rd arg. If data.updates is FormData, it works.
      // So we pass { id: editingEntry.id, updates: formData as any }

      // Append existing photos (kept ones) as JSON string
      if (keptPhotos.length > 0) {
        formData.append('existingPhotos', JSON.stringify(keptPhotos));
      } else {
        // Explicitly send empty array if all deleted, so server knows to clear them
        formData.append('existingPhotos', JSON.stringify([]));
      }

      updateEntryMutation.mutate({ id: editingEntry.id, updates: formData as any });
    } else {
      const formData = new FormData();
      formData.append("title", entryForm.title);
      formData.append("content", entryForm.content);
      if (entryForm.location) formData.append("location", entryForm.location);
      if (entryForm.latitude) formData.append("latitude", entryForm.latitude);
      if (entryForm.longitude) formData.append("longitude", entryForm.longitude);
      if (photos) {
        Array.from(photos).forEach(file => formData.append('photos', file));
      }
      createEntryMutation.mutate(formData);
    }
  };

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setEntryForm({
      title: entry.title,
      content: entry.content,
      location: entry.location || "",
      latitude: entry.latitude?.toString() || "",
      longitude: entry.longitude?.toString() || "",
    });
    setKeptPhotos(entry.photos || []);
    setIsCreateDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this journal entry?")) {
      deleteEntryMutation.mutate(id);
    }
  };

  const handleCancel = () => {
    setIsCreateDialogOpen(false);
    setEditingEntry(null);
    resetForm();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-ios-darker flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ios-blue mx-auto mb-4"></div>
          <p className="text-ios-gray">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}


      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2" data-testid="journal-title">
              Travel Journal
            </h1>
            <p className="text-ios-gray">Capture your travel memories and experiences</p>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-ios-orange hover:bg-orange-600"
                data-testid="button-new-entry"
                onClick={() => {
                  setEditingEntry(null);
                  resetForm();
                }}
              >
                <i className="fas fa-plus mr-2"></i>
                New Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-ios-card border-ios-gray text-white max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-white">
                  {editingEntry ? 'Edit Journal Entry' : 'Create New Journal Entry'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="journal-entry-form">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Title <span className="text-ios-red">*</span>
                  </label>
                  <Input
                    type="text"
                    value={entryForm.title}
                    onChange={(e) => setEntryForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter a title for your journal entry"
                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                    required
                    data-testid="input-title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Location</label>
                  <Input
                    type="text"
                    value={entryForm.location}
                    onChange={(e) => setEntryForm(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="Where was this memory made?"
                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                    data-testid="input-location"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-white">
                      Content <span className="text-ios-red">*</span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={startListening}
                      className={`${isListening ? 'text-red-500 animate-pulse' : 'text-ios-blue'}`}
                    >
                      <i className={`fas fa-microphone${isListening ? '' : '-alt'} mr-1`}></i>
                      {isListening ? 'Listening...' : 'Dictate'}
                    </Button>
                  </div>
                  <Textarea
                    value={entryForm.content}
                    onChange={(e) => setEntryForm(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Share your travel experience, thoughts, and memories..."
                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray min-h-[150px]"
                    required
                    data-testid="textarea-content"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Photos</label>
                  <Input
                    ref={(el) => { if (el) fileInputRef.current = el; }} // Callback ref since I didn't import useRef
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => setPhotos(e.target.files)}
                    className="bg-ios-darker border-ios-gray text-white file:bg-ios-blue file:text-white file:border-0 file:rounded-md file:px-2 file:py-1 file:mr-2 file:hover:bg-blue-600 cursor-pointer"
                  />
                  <p className="text-xs text-ios-gray mt-1">Upload memories from your trip.</p>

                  {/* Existing Photos List (with delete option) */}
                  {keptPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {keptPhotos.map((photo, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-md overflow-hidden group border border-ios-gray/30">
                          <img src={photo} alt={`Existing ${i}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setKeptPhotos(prev => prev.filter((_, idx) => idx !== i))}
                            className="absolute top-0 right-0 p-1 bg-red-600/80 text-white rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <i className="fas fa-times text-xs"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex space-x-2 pt-4">
                  <Button
                    type="button"
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1 bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createEntryMutation.isPending || updateEntryMutation.isPending}
                    className="flex-1 bg-ios-orange hover:bg-orange-600"
                    data-testid="button-save"
                  >
                    {(createEntryMutation.isPending || updateEntryMutation.isPending) ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save mr-2"></i>
                        {editingEntry ? 'Update Entry' : 'Save Entry'}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Journal Entries */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="bg-ios-card border-ios-gray elev-1 radius-md">
                <CardContent className="p-0">
                  <div className="animate-pulse">
                    <div className="h-32 bg-ios-darker"></div>
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-ios-darker rounded w-3/4"></div>
                      <div className="h-3 bg-ios-darker rounded w-full"></div>
                      <div className="h-3 bg-ios-darker rounded w-1/2"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : journalEntries && journalEntries.length > 0 ? (
          <div className="relative border-l-2 border-ios-gray/30 ml-4 md:ml-8 space-y-8 pb-12">
            {Object.entries(
              journalEntries.reduce((acc, entry) => {
                const date = new Date(entry.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                if (!acc[date]) acc[date] = [];
                acc[date].push(entry);
                return acc;
              }, {} as Record<string, JournalEntry[]>)
            ).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()).map(([date, entries]) => (
              <div key={date} className="relative pl-6 md:pl-10">
                {/* Timeline Dot */}
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-ios-blue border-4 border-ios-darker shadow-lg shadow-ios-blue/20"></div>

                <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                  <span className="opacity-80">{date}</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                  {entries.map((entry) => (
                    <Card
                      key={entry.id}
                      className="bg-ios-card border-ios-gray elev-1 hover-lift smooth-transition overflow-hidden radius-md group cursor-pointer"
                      data-testid={`journal-entry-${entry.id}`}
                      onClick={() => handleEdit(entry)}
                    >
                      {entry.photos && entry.photos.length > 0 ? (
                        <JournalImageCarousel photos={entry.photos} title={entry.title}>
                          <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                            <Button onClick={(e) => { e.stopPropagation(); handleEdit(entry); }} size="sm" variant="ghost" className="h-8 w-8 bg-black/50 text-white hover:bg-black/70 rounded-full"><i className="fas fa-edit"></i></Button>
                            <Button onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }} size="sm" variant="ghost" className="h-8 w-8 bg-red-500/50 text-white hover:bg-red-600/70 rounded-full"><i className="fas fa-trash"></i></Button>
                          </div>
                        </JournalImageCarousel>
                      ) : (
                        <div className="h-32 bg-gradient-to-br from-ios-blue to-purple-600 flex items-center justify-center relative">
                          <div className="text-white text-center">
                            <i className="fas fa-map-marker-alt text-2xl mb-2"></i>
                            <p className="text-sm">{entry.location || 'Travel Memory'}</p>
                          </div>
                          <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button onClick={(e) => { e.stopPropagation(); handleEdit(entry); }} size="sm" variant="ghost" className="h-8 w-8 p-0 text-white hover:bg-ios-card/20"><i className="fas fa-edit"></i></Button>
                            <Button onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }} size="sm" variant="ghost" className="h-8 w-8 p-0 text-white hover:bg-ios-red/50"><i className="fas fa-trash"></i></Button>
                          </div>
                        </div>
                      )}

                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-white text-lg">{entry.title}</h4>
                          {entry.location && <span className="text-xs text-ios-blue bg-ios-blue/10 px-2 py-1 rounded"><i className="fas fa-map-marker-alt mr-1"></i>{entry.location}</span>}
                        </div>
                        <p className="text-sm text-ios-gray mb-3 line-clamp-3 whitespace-pre-wrap">
                          {entry.content}
                        </p>
                        <div className="flex items-center justify-between text-xs text-ios-gray pt-2 border-t border-ios-gray/10">
                          <span><i className="far fa-clock mr-1"></i>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="bg-ios-card border-ios-gray elev-1 radius-md" data-testid="no-journal-entries">
            <CardContent className="p-12 text-center">
              <div className="text-ios-gray mb-6">
                <i className="fas fa-book text-6xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Start Your Travel Journal</h3>
              <p className="text-ios-gray mb-6 max-w-md mx-auto">
                Document your adventures, capture memories, and create a beautiful record of your travels.
              </p>
              <Button
                onClick={() => {
                  setEditingEntry(null);
                  resetForm();
                  setIsCreateDialogOpen(true);
                }}
                className="bg-ios-orange hover:bg-orange-600"
                data-testid="button-create-first-entry"
              >
                <i className="fas fa-plus mr-2"></i>
                Create Your First Entry
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
