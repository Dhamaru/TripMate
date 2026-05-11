import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { TripMateLogo } from "@/components/TripMateLogo";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { LanguageTranslator } from "@/components/LanguageTranslator";

export default function TranslatePage() {
  const { user } = useAuth() as { user: any };
  const [, navigate] = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#222222] tracking-tight">Language Translator</h1>
        <p className="text-[#6a6a6a] text-sm mt-0.5">Offline translation for 10+ languages</p>
      </div>
      <LanguageTranslator className="max-w-2xl" />
    </div>
  );
}
