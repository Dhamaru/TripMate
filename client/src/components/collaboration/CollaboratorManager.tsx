import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store";
import { tripsApi } from "../../lib/api/trips.api";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, X, Shield, Eye, Edit2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CollaboratorManagerProps {
    tripId: string;
    ownerId: string;
}

export function CollaboratorManager({ tripId, ownerId }: CollaboratorManagerProps) {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<"editor" | "viewer">("viewer");
    const [isOpen, setIsOpen] = useState(false);

    const isOwner = user?.id === ownerId || (user as any)?._id === ownerId;

    const { data: collaborators, isLoading } = useQuery({
        queryKey: ["trips", tripId, "collaborators"],
        queryFn: () => tripsApi.getCollaborators(tripId),
        enabled: !!tripId,
    });

    const addMutation = useMutation({
        mutationFn: (data: { email: string; role: string }) =>
            tripsApi.addCollaborator(tripId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["trips", tripId, "collaborators"] });
            toast({
                title: "Collaborator added",
                description: "The user has been added to your trip team.",
            });
            setEmail("");
        },
        onError: (error: any) => {
            toast({
                title: "Failed to add collaborator",
                description: error.message || "An error occurred while adding the collaborator.",
                variant: "destructive",
            });
        },
    });

    const removeMutation = useMutation({
        mutationFn: (collaboratorId: string) =>
            tripsApi.removeCollaborator(tripId, collaboratorId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["trips", tripId, "collaborators"] });
            toast({
                title: "Collaborator removed",
                description: "The user has been removed from your trip team.",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Failed to remove collaborator",
                description: error.message || "An error occurred while removing the collaborator.",
                variant: "destructive",
            });
        },
    });

    const handleAddCollaborator = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        addMutation.mutate({ email, role });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Users className="w-4 h-4" />
                    Trip Team
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        Manage Trip Team
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 pt-4">
                    {isOwner && (
                        <form onSubmit={handleAddCollaborator} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Invite by Email</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="email"
                                        placeholder="friend@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="flex-1"
                                    />
                                    <Select
                                        value={role}
                                        onValueChange={(v: "editor" | "viewer") => setRole(v)}
                                    >
                                        <SelectTrigger className="w-[110px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="viewer">Viewer</SelectItem>
                                            <SelectItem value="editor">Editor</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full gap-2"
                                disabled={addMutation.isPending}
                            >
                                <UserPlus className="w-4 h-4" />
                                {addMutation.isPending ? "Inviting..." : "Add to Team"}
                            </Button>
                        </form>
                    )}

                    <div className="space-y-4">
                        <Label>Current Members</Label>
                        <div className="space-y-3">
                            {isLoading ? (
                                <div className="text-center py-4 text-muted-foreground text-sm">
                                    Loading team members...
                                </div>
                            ) : collaborators && collaborators.length > 0 ? (
                                <AnimatePresence mode="popLayout">
                                    {collaborators.map((col: any) => (
                                        <motion.div
                                            key={col.userId?._id || col.userId}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/50"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={col.userId?.avatar} />
                                                    <AvatarFallback>
                                                        {col.userId?.firstName?.charAt(0) || "U"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium">
                                                        {col.userId?.firstName} {col.userId?.lastName}
                                                        {col.userId?._id === auth?.user?._id && " (You)"}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {col.userId?.email}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px] uppercase tracking-wider"
                                                >
                                                    {col.role === "editor" ? (
                                                        <Edit2 className="w-3 h-3 mr-1" />
                                                    ) : (
                                                        <Eye className="w-3 h-3 mr-1" />
                                                    )}
                                                    {col.role}
                                                </Badge>
                                                {isOwner && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => removeMutation.mutate(col.userId?._id || col.userId)}
                                                        disabled={removeMutation.isPending}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            ) : (
                                <div className="text-center py-8 border-2 border-dashed rounded-xl border-border/50">
                                    <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        No team members yet.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
