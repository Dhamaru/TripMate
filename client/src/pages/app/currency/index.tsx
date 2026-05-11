import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CurrencyConverter } from "@/components/CurrencyConverter";
import { useAuth } from "@/hooks/useAuth";

export default function CurrencyPage() {
  const { user } = useAuth() as { user: any };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Currency Converter</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Real-time exchange rates for your travels</p>
      </div>
      <CurrencyConverter className="max-w-md" />
    </div>
  );
}
