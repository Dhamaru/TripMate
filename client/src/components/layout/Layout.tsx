import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/NotificationBell";
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
          "hidden md:flex flex-col bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] transition-all duration-300 ease-in-out fixed left-0 top-0 bottom-0 z-40",
          collapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        {/* Logo bar */}
        <div className={cn(
          "h-16 flex items-center border-b border-[hsl(var(--sidebar-border))] flex-shrink-0 transition-all duration-300",
          collapsed ? "justify-center px-0" : "px-5"
        )}>
          {collapsed ? (
            <div className="w-7 h-7 rounded-lg bg-[var(--amber)] flex items-center justify-center flex-shrink-0">
              <span className="text-black text-[11px] font-bold font-display">T</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--amber)] flex items-center justify-center flex-shrink-0">
                <span className="text-black text-[11px] font-bold">T</span>
              </div>
              <div>
                <div className="font-display text-[15px] font-bold text-[hsl(var(--sidebar-foreground))] leading-none tracking-tight">
                  TripMate
                </div>
                <div className="text-[9px] text-[hsl(var(--muted-foreground))] uppercase tracking-[0.12em] mt-0.5 font-sans-clean">
                  AI Companion
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-5 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 h-10 cursor-pointer relative group transition-all duration-150 rounded-lg",
                    collapsed ? "px-0 justify-center" : "px-3",
                    isActive
                      ? "text-[var(--amber)] bg-[var(--amber-dim)]"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {isActive && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--amber)] rounded-r-full" />
                  )}
                  <item.icon className={cn(
                    "h-[18px] w-[18px] flex-shrink-0 transition-all duration-150",
                    isActive ? "text-[var(--amber)]" : "group-hover:scale-110"
                  )} />
                  {!collapsed && (
                    <span className="text-[13px] font-medium tracking-wide whitespace-nowrap font-sans-clean">
                      {item.label}
                    </span>
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg text-[11px] text-[hsl(var(--foreground))] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                      {item.label}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom: profile + collapse */}
        <div className="border-t border-[hsl(var(--sidebar-border))] p-2 space-y-1 flex-shrink-0">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-lg h-9 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-all",
              collapsed ? "px-0 justify-center" : "px-3"
            )}
            title="Toggle theme"
          >
            {theme === "dark"
              ? <Sun className="h-[16px] w-[16px] text-[var(--amber)] flex-shrink-0" />
              : <Moon className="h-[16px] w-[16px] flex-shrink-0" />
            }
            {!collapsed && (
              <span className="text-[12px] font-sans-clean font-medium">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
            )}
          </button>

          {/* Profile */}
          <Link href="/app/profile">
            <div className={cn(
              "flex items-center gap-2.5 rounded-lg h-11 cursor-pointer group hover:bg-[hsl(var(--muted))] transition-colors",
              collapsed ? "px-0 justify-center" : "px-3"
            )}>
              <Avatar className="h-7 w-7 rounded-full border border-[hsl(var(--border))] flex-shrink-0">
                <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                <AvatarFallback className="bg-[var(--amber)] text-black text-[11px] font-bold">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-[hsl(var(--foreground))] truncate font-sans-clean">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-[0.08em] font-sans-clean">
                    {user?.isGuest ? "Guest" : "Member"}
                  </div>
                </div>
              )}
            </div>
          </Link>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "w-full flex items-center gap-2 rounded-lg h-8 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-all",
              collapsed ? "px-0 justify-center" : "px-3"
            )}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed
              ? <ChevronRight className="h-3.5 w-3.5" />
              : <><ChevronLeft className="h-3.5 w-3.5" /><span className="text-[11px] font-sans-clean">Collapse</span></>
            }
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────── */}
      <div className={cn(
        "flex-1 flex flex-col h-full transition-all duration-300 ease-in-out",
        "md:ml-[240px]",
        collapsed && "md:ml-[60px]"
      )}>

        {/* Top bar */}
        <header className="h-14 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[var(--amber)] flex items-center justify-center">
              <span className="text-black text-[10px] font-bold">T</span>
            </div>
            <span className="font-display text-sm font-bold text-[hsl(var(--foreground))]">TripMate</span>
          </div>

          <div className="hidden md:block" />

          {/* Right: notifications + user */}
          <div className="flex items-center gap-3">
          <NotificationBell />
          <Link href="/app/profile">
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[13px] font-semibold text-[hsl(var(--foreground))] group-hover:text-[var(--amber)] transition-colors flex items-center gap-1.5 font-sans-clean">
                  {user?.isGuest && (
                    <span className="bg-[var(--amber-dim)] text-[var(--amber)] text-[9px] px-2 py-0.5 rounded-full border border-[var(--amber-dim)] font-bold tracking-wide">
                      GUEST
                    </span>
                  )}
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="label-xs text-[hsl(var(--muted-foreground))]">
                  {user?.isGuest ? "Trial" : "Member"}
                </span>
              </div>
              <Avatar className="h-8 w-8 rounded-full border border-[hsl(var(--border))] group-hover:border-[var(--amber)] transition-all duration-200">
                <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                <AvatarFallback className="bg-[var(--amber)] text-black text-[11px] font-bold">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
            </div>
          </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="px-6 py-7 max-w-5xl mx-auto w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-3 left-3 right-3 z-50">
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.35)] px-1 py-1.5 flex items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href} className="flex-1">
                  <div className={cn(
                    "flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-all duration-150",
                    isActive
                      ? "text-[var(--amber)]"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}>
                    <item.icon className={cn("h-[18px] w-[18px]", isActive && "drop-shadow-[0_0_6px_rgba(232,144,10,0.6)]")} />
                    <span className="label-xs">{item.label}</span>
                  </div>
                </Link>
              );
            })}
            <Link href="/app/profile" className="flex-1">
              <div className="flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all">
                <Avatar className="h-[18px] w-[18px] rounded-full border border-[hsl(var(--border))]">
                  <AvatarImage src={user?.profileImageUrl} />
                  <AvatarFallback className="bg-[var(--amber)] text-black text-[8px] font-bold">
                    {user?.firstName?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="label-xs">Me</span>
              </div>
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
