import { LucideIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    className
}: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
            <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mb-4">
                <Icon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
            <p className="text-gray-400 max-w-md mb-6">{description}</p>
            {actionLabel && onAction && (
                <Button onClick={onAction} className="bg-ios-blue hover:bg-blue-600">
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
