import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface NamePromptDialogProps {
    open: boolean;
    title: string;
    defaultValue?: string;
    confirmLabel?: string;
    onConfirm: (value: string) => void;
    onOpenChange: (open: boolean) => void;
}

export function NamePromptDialog({ open, title, defaultValue = "", confirmLabel = "Save", onConfirm, onOpenChange }: NamePromptDialogProps) {
    const [value, setValue] = useState(defaultValue);

    useEffect(() => {
        if (open) setValue(defaultValue);
    }, [open, defaultValue]);

    const handleConfirm = () => {
        const trimmed = value.trim();
        if (!trimmed) return;
        onConfirm(trimmed);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-foreground">{title}</DialogTitle>
                </DialogHeader>
                <Input
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                    className="bg-muted border-border text-foreground"
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={!value.trim()} className="bg-[#163F73] hover:bg-[#0F2C52] text-white">{confirmLabel}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
