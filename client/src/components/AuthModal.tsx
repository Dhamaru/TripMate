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
            <DialogContent className="sm:max-w-[425px] bg-ios-card border-ios-gray text-white">
                <DialogHeader>
                    <DialogTitle className="text-white">Authentication Required</DialogTitle>
                    <DialogDescription className="text-ios-gray">
                        Your session has expired. Please sign in again to complete this action.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="border-ios-gray text-white hover:bg-ios-gray/20"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={onSignIn}
                        className="bg-ios-blue hover:bg-blue-600 text-white"
                    >
                        Sign In
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
