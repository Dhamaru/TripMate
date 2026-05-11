import React from "react";
import { TripMateLogo } from "@/components/TripMateLogo";
import authHero from "@/assets/auth_hero.png";
import { motion } from "framer-motion";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col md:flex-row overflow-hidden">
      {/* Visual Left Side (Desktop) */}
      <div className="hidden md:flex md:w-1/2 relative bg-ios-darker overflow-hidden border-r border-white/5">
        <div className="absolute inset-0 z-0">
          <img 
            src={authHero} 
            alt="Travel background" 
            className="w-full h-full object-cover opacity-60 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        </div>
        
        <div className="relative z-10 p-12 flex flex-col justify-between w-full">
          <header>
            <TripMateLogo size="lg" showText={true} />
          </header>
          
          <div className="space-y-6 max-w-md">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl font-bold leading-tight"
            >
              Your Intelligent <br />
              <span className="text-ios-blue">Travel Companion</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-ios-gray font-medium"
            >
              Seamless planning, AI-powered itineraries, and real-time travel intelligence — all in one place.
            </motion.p>
            
            <div className="pt-8 grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue">
                  <i className="fa-solid fa-wand-magic-sparkles" />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-ios-gray">AI Powered</p>
                <p className="text-sm">Smart suggestions tailored to you.</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-ios-orange/10 flex items-center justify-center text-ios-orange">
                  <i className="fa-solid fa-map-location-dot" />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-ios-gray">Seamless</p>
                <p className="text-sm">Everything you need for your journey.</p>
              </div>
            </div>
          </div>
          
          <footer className="text-ios-gray/50 text-xs">
            © 2026 TripMate Intelligence. Explore the world intelligently.
          </footer>
        </div>
      </div>

      {/* Form Side */}
      <main className="flex-1 flex flex-col p-6 md:p-12 overflow-y-auto">
        <div className="md:hidden mb-8">
          <TripMateLogo size="md" showText={true} />
        </div>
        
        <div className="flex-1 flex items-center justify-center w-full max-w-[480px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
