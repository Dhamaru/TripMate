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
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}


      {/* Main Content */}
      <div className="responsive-container py-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <h1 className="text-4xl font-bold text-white mb-2">Language Translator</h1>
          <p className="text-lg text-ios-gray">Offline translation for 10+ languages</p>
        </motion.div>

        {/* Language Translator Component */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <LanguageTranslator className="max-w-2xl mx-auto" />
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-4"
        >
          <div className="text-center">
            <Link href="/app/features">
              <Button className="bg-gradient-to-r from-ios-blue to-purple-600 smooth-transition interactive-tap radius-md">
                Explore More Tools
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
