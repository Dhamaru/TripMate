import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AuthModalProps {
    open: boolean;
    onClose: () => void;
    onSignIn: () => void;
}

export function AuthModal({ open, onClose, onSignIn }: AuthModalProps) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px] bg-card border-border text-white">
                <DialogHeader>
                    <DialogTitle className="text-white">Authentication Required</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Your session has expired. Please sign in again to complete this action.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="border-border text-white hover:bg-muted/20"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={onSignIn}
                        className="bg-[#1D4E89] hover:bg-blue-600 text-white"
                    >
                        Sign In
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
