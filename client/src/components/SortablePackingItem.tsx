import React, { useState, useRef } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IPackingListItem } from "@shared/schema";

interface SortablePackingItemProps {
    item: IPackingListItem;
    handleToggle: () => void;
    handleDelete: () => void;
}

export function SortablePackingItem({ item, handleToggle, handleDelete }: SortablePackingItemProps) {
    const controls = useDragControls();
    const [isPressing, setIsPressing] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);

    const handlePointerDown = (e: React.PointerEvent) => {
        // Only handle primary button (left click or touch)
        if (e.button !== 0) return;

        startPosRef.current = { x: e.clientX, y: e.clientY };
        setIsPressing(true);

        timeoutRef.current = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            try {
                controls.start(e);
            } catch (err) {
                console.error("Failed to start drag:", err);
            }
            setIsPressing(false);
        }, 2000);
    };

    const cancelPress = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsPressing(false);
        startPosRef.current = null;
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (startPosRef.current) {
            const dx = Math.abs(e.clientX - startPosRef.current.x);
            const dy = Math.abs(e.clientY - startPosRef.current.y);
            // Cancel if moved more than 10px (scrolling or shaking)
            if (dx > 10 || dy > 10) {
                cancelPress();
            }
        }
    };

    return (
        <Reorder.Item
            value={item}
            dragListener={false}
            dragControls={controls}
            className="relative"
            style={{ touchAction: "pan-y" }} // Allow scrolling while waiting for long press
        >
            <div
                className={`group flex items-center p-4 bg-gray-900 border rounded-2xl transition-all cursor-pointer ${isPressing ? "border-blue-500 scale-[0.98]" : "border-gray-800 hover:border-gray-700"
                    }`}
                onPointerDown={handlePointerDown}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerMove={handlePointerMove}
                onClick={() => {
                    // Only toggle if we weren't just dragging/long-pressing
                    if (!isPressing) handleToggle();
                }}
            >
                <div className="mr-3 text-gray-600">
                    {/* Visual cue that it's drag. handle */}
                    <GripVertical className={`w-5 h-5 ${isPressing ? "text-blue-500" : ""}`} />
                </div>

                <div
                    className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center transition-colors ${item.packed ? "bg-blue-500 border-blue-500" : "border-gray-600 group-hover:border-blue-400"
                        }`}
                // Stop propagation on checkbox to prevent drag logic interference if needed, 
                // but we want the whole row to be the target.
                // We'll let the row click handler manage toggle.
                >
                    {item.packed && <CheckCircle2 className="w-4 h-4 text-white" />}
                </div>

                <div className="flex-1 flex items-center select-none">
                    <span className={`font-medium ${item.packed ? "text-gray-500 line-through" : "text-white"}`}>
                        {item.name}
                    </span>
                    {item.category && (
                        <span className="ml-3 text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full">
                            {item.category}
                        </span>
                    )}
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-full h-8 w-8 p-0"
                    onClick={(e) => {
                        e.stopPropagation(); // Don't toggle packed state
                        handleDelete();
                    }}
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on delete button
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </Reorder.Item>
    );
}
