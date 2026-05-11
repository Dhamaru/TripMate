import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Compass,
  Grid,
  MessageSquare,
  Book,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";

const NAV_ITEMS = [
  { label: "Home",     icon: Home,          href: "/app/home" },
  { label: "Trips",    icon: Compass,       href: "/app/trips" },
  { label: "Journal",  icon: Book,          href: "/app/journal" },
  { label: "Tools",    icon: Grid,          href: "/app/tools" },
  { label: "Feedback", icon: MessageSquare, href: "/app/feedback" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-card border-r border transition-all duration-300 ease-in-out fixed left-0 top-0 bottom-0 z-40",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "h-16 flex items-center border-b border transition-all duration-300 flex-shrink-0",
          collapsed ? "justify-center px-0" : "px-5"
        )}>
          <TripMateLogo size="sm" showText={!collapsed} />
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl h-11 cursor-pointer relative group transition-all duration-150",
                    collapsed ? "px-0 justify-center" : "px-3",
                    isActive
                      ? "bg-amber-50 text-amber-600 font-semibold"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className={cn(
                    "h-5 w-5 flex-shrink-0 transition-transform duration-200",
                    isActive ? "text-amber-500" : "group-hover:scale-105"
                  )} />
                  {!collapsed && (
                    <span className="text-sm whitespace-nowrap">{item.label}</span>
                  )}
                  {isActive && !collapsed && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-gray-900 rounded-lg text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                      {item.label}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Profile + collapse */}
        <div className="border-t border p-3 space-y-1 flex-shrink-0">
          <Link href="/app/profile">
            <div className={cn(
              "flex items-center gap-3 rounded-xl h-11 cursor-pointer group hover:bg-muted/50 transition-colors",
              collapsed ? "px-0 justify-center" : "px-3"
            )}>
              <Avatar className="h-7 w-7 rounded-full border border flex-shrink-0">
                <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                <AvatarFallback className="bg-[#1E3A8A] text-white text-xs font-bold">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {user?.isGuest ? "Guest" : "Member"}
                  </div>
                </div>
              )}
            </div>
          </Link>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "w-full flex items-center gap-2 rounded-xl h-9 text-muted-foreground hover:bg-muted/50 hover:text-gray-600 transition-all",
              collapsed ? "px-0 justify-center" : "px-3"
            )}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed
              ? <ChevronRight className="h-4 w-4" />
              : <><ChevronLeft className="h-4 w-4" /><span className="text-xs">Collapse</span></>
            }
          </button>
        </div>
      </aside>

      {/* ── Main content area ────────────────────────── */}
      <div className={cn(
        "flex-1 flex flex-col h-full transition-all duration-300 ease-in-out",
        "md:ml-64",
        collapsed && "md:ml-16"
      )}>

        {/* Top bar */}
        <header className="h-16 bg-card border-b border px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
          <div className="md:hidden">
            <TripMateLogo size="sm" />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-xl bg-muted/50 hover:bg-gray-100 transition-colors border border"
              title="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5 text-amber-500" />
              ) : (
                <Moon className="h-5 w-5 text-[#1E3A8A]" />
              )}
            </button>
          </div>

          <Link href="/app/profile">
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-semibold text-foreground group-hover:text-amber-600 transition-colors flex items-center gap-1.5">
                  {user?.isGuest && (
                    <span className="bg-amber-50 text-amber-600 text-[10px] px-2 py-0.5 rounded-full border border-amber-200 font-bold">
                      GUEST
                    </span>
                  )}
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                  {user?.isGuest ? "Trial Plan" : "Member"}
                </span>
              </div>
              <Avatar className="h-9 w-9 rounded-full border-2 border group-hover:border-amber-400 transition-all duration-200">
                <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                <AvatarFallback className="bg-[#1E3A8A] text-white text-xs font-bold">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
            </div>
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="px-6 py-6 max-w-6xl mx-auto w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-4 left-4 right-4 z-50">
          <div className="bg-card border border rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.10)] p-1.5 flex items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href} className="flex-1">
                  <div className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all duration-150",
                    isActive
                      ? "text-amber-600 bg-amber-50"
                      : "text-muted-foreground hover:text-gray-600"
                  )}>
                    <item.icon className="h-5 w-5" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
                  </div>
                </Link>
              );
            })}
            <Link href="/app/profile" className="flex-1">
              <div className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-muted-foreground hover:text-gray-600 transition-all">
                <Avatar className="h-5 w-5 rounded-full border border">
                  <AvatarImage src={user?.profileImageUrl} />
                  <AvatarFallback className="bg-[#1E3A8A] text-white text-[8px] font-bold">
                    {user?.firstName?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[9px] font-bold uppercase tracking-wider">Me</span>
              </div>
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
