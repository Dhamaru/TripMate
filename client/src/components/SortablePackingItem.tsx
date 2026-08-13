import React, { useState, useRef } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IPackingListItem } from "@shared/schema";
import { QuantityControl } from "./QuantityControl";

interface SortablePackingItemProps {
    item: IPackingListItem;
    handleToggle: () => void;
    handleDelete: () => void;
    handleQuantityChange?: (newQuantity: number) => void;
}

export function SortablePackingItem({ item, handleToggle, handleDelete, handleQuantityChange }: SortablePackingItemProps) {
    const controls = useDragControls();
    const [isPressing, setIsPressing] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);
    // isPressing flips to false the moment a drag starts (so the "pressed"
    // border/scale styling stops), but the click handler used that same
    // flag to decide whether a toggle should fire — so releasing the
    // pointer after a drag always toggled the item too. Track drag state
    // separately so a completed drag can suppress the click without
    // affecting the visual pressed state.
    const isDraggingRef = useRef(false);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        startPosRef.current = { x: e.clientX, y: e.clientY };
        setIsPressing(true);
        timeoutRef.current = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            try { controls.start(e); isDraggingRef.current = true; } catch (err) { console.error("Failed to start drag:", err); }
            setIsPressing(false);
        }, 2000);
    };

    const cancelPress = () => {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        setIsPressing(false);
        startPosRef.current = null;
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (startPosRef.current) {
            const dx = Math.abs(e.clientX - startPosRef.current.x);
            const dy = Math.abs(e.clientY - startPosRef.current.y);
            if (dx > 10 || dy > 10) cancelPress();
        }
    };

    return (
        <Reorder.Item value={item} dragListener={false} dragControls={controls} className="relative" style={{ touchAction: "pan-y" }}>
            <div
                className={`group flex items-center p-4 bg-card border rounded-2xl transition-all cursor-pointer ${isPressing ? "border-[#163F73] scale-[0.98]" : "border-border hover:border-[#163F73]/40"}`}
                onPointerDown={handlePointerDown}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerMove={handlePointerMove}
                onClick={() => {
                    if (isDraggingRef.current) { isDraggingRef.current = false; return; }
                    if (!isPressing) handleToggle();
                }}
            >
                <div className="mr-3 text-muted-foreground">
                    <GripVertical className={`w-5 h-5 ${isPressing ? "text-[#163F73]" : ""}`} />
                </div>

                <div className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center transition-colors ${item.packed ? "bg-[#1D4E89] border-[#1D4E89]" : "border-border group-hover:border-[#163F73]/60"}`}>
                    {item.packed && <CheckCircle2 className="w-4 h-4 text-white" />}
                </div>

                <div className="flex-1 flex items-center select-none">
                    <span className={`font-medium ${item.packed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                        {item.name}
                    </span>
                    {item.category && (
                        <span className="ml-3 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                            {item.category}
                        </span>
                    )}
                </div>

                <div className="mr-3" onPointerDown={(e) => e.stopPropagation()}>
                    <QuantityControl quantity={item.quantity || 1} onChange={(newVal) => handleQuantityChange && handleQuantityChange(newVal)} />
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-red-500 transition-colors rounded-full h-8 w-8 p-0"
                    onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </Reorder.Item>
    );
}
