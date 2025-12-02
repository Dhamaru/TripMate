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

export default function Journal() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth() as { user: User | undefined; isLoading: boolean; isAuthenticated: boolean };
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!entryForm.title.trim() || !entryForm.content.trim()) {
      toast({ title: "Missing Information", description: "Please fill in the title and content.", variant: "destructive" });
      return;
    }

    if (editingEntry) {
      const updates = {
        title: entryForm.title,
        content: entryForm.content,
        location: entryForm.location || undefined,
        latitude: entryForm.latitude ? parseFloat(entryForm.latitude) : undefined,
        longitude: entryForm.longitude ? parseFloat(entryForm.longitude) : undefined,
      };
      updateEntryMutation.mutate({ id: editingEntry.id, updates });
    } else {
      const formData = new FormData();
      formData.append("title", entryForm.title);
      formData.append("content", entryForm.content);
      if (entryForm.location) formData.append("location", entryForm.location);
      if (entryForm.latitude) formData.append("latitude", entryForm.latitude);
      if (entryForm.longitude) formData.append("longitude", entryForm.longitude);
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
                  <label className="block text-sm font-medium text-white mb-2">
                    Content <span className="text-ios-red">*</span>
                  </label>
                  <Textarea
                    value={entryForm.content}
                    onChange={(e) => setEntryForm(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Share your travel experience, thoughts, and memories..."
                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray min-h-[150px]"
                    required
                    data-testid="textarea-content"
                  />
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {journalEntries.map((entry) => (
              <Card
                key={entry.id}
                className="bg-ios-card border-ios-gray elev-1 hover-lift smooth-transition overflow-hidden radius-md"
                data-testid={`journal-entry-${entry.id}`}
              >
                <div className="h-32 bg-gradient-to-br from-ios-blue to-purple-600 flex items-center justify-center relative">
                  <div className="text-white text-center">
                    <i className="fas fa-map-marker-alt text-2xl mb-2"></i>
                    <p className="text-sm">{entry.location || 'Travel Memory'}</p>
                  </div>
                  <div className="absolute top-2 right-2 flex space-x-1">
                    <Button
                      onClick={() => handleEdit(entry)}
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-white hover:bg-ios-card/20 smooth-transition interactive-tap min-tap-target"
                      data-testid={`button-edit-${entry.id}`}
                    >
                      <i className="fas fa-edit text-xs"></i>
                    </Button>
                    <Button
                      onClick={() => handleDelete(entry.id)}
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-white hover:bg-ios-red/50 smooth-transition interactive-tap min-tap-target"
                      data-testid={`button-delete-${entry.id}`}
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </Button>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h4 className="font-bold mb-2 text-white">{entry.title}</h4>
                  <p className="text-sm text-ios-gray mb-3 line-clamp-3">
                    {entry.content}
                  </p>
                  <div className="flex items-center justify-between text-xs text-ios-gray">
                    <span>{new Date(entry.createdAt as any).toLocaleDateString()}</span>
                    {entry.photos && entry.photos.length > 0 && (
                      <span className="flex items-center">
                        <i className="fas fa-camera mr-1"></i>
                        {entry.photos.length}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
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
