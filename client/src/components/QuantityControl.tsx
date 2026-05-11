import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

interface QuantityControlProps {
    quantity: number;
    onChange: (newQuantity: number) => void;
    min?: number;
    max?: number;
}

export function QuantityControl({ quantity, onChange, min = 1, max = 99 }: QuantityControlProps) {
    const handleDecrement = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (quantity > min) onChange(quantity - 1);
    };

    const handleIncrement = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (quantity < max) onChange(quantity + 1);
    };

    return (
        <div className="flex items-center space-x-2 bg-muted rounded-md p-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted/80" onClick={handleDecrement} disabled={quantity <= min}>
                <Minus className="h-3 w-3" />
            </Button>
            <span className="text-sm font-medium w-4 text-center text-foreground">{quantity}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted/80" onClick={handleIncrement} disabled={quantity >= max}>
                <Plus className="h-3 w-3" />
            </Button>
        </div>
    );
}
