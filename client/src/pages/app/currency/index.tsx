import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CurrencyConverter } from "@/components/CurrencyConverter";
import { useAuth } from "@/hooks/useAuth";

export default function CurrencyPage() {
  const { user } = useAuth() as { user: any };

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Main Content */}
      <div className="responsive-container py-8 max-w-4xl pt-header-gap">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <h1 className="text-4xl font-bold text-white mb-2">Currency Converter</h1>
          <p className="text-lg text-ios-gray">Real-time exchange rates for your travels</p>
        </motion.div>

        {/* Currency Converter Component */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <CurrencyConverter className="max-w-md mx-auto" />
        </motion.div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-4">
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
