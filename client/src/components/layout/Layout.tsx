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
  User,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home",     icon: Home,         href: "/app/home" },
  { label: "Trips",    icon: Compass,      href: "/app/trips" },
  { label: "Journal",  icon: Book,         href: "/app/journal" },
  { label: "Tools",    icon: Grid,         href: "/app/tools" },
  { label: "Feedback", icon: MessageSquare, href: "/app/feedback" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full bg-[#f7f7f7] overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-white border-r border-[#ebebeb] transition-all duration-300 ease-in-out fixed left-0 top-0 bottom-0 z-40",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "h-16 flex items-center border-b border-[#ebebeb] transition-all duration-300 flex-shrink-0",
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
                      ? "bg-[#fff1f3] text-[#ff385c] font-semibold"
                      : "text-[#6a6a6a] hover:bg-[#f7f7f7] hover:text-[#222222]"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className={cn(
                    "h-5 w-5 flex-shrink-0 transition-transform duration-200",
                    isActive ? "text-[#ff385c]" : "group-hover:scale-105"
                  )} />
                  {!collapsed && (
                    <span className="text-sm whitespace-nowrap">{item.label}</span>
                  )}
                  {/* Active indicator */}
                  {isActive && !collapsed && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#ff385c]" />
                  )}
                  {/* Collapsed tooltip */}
                  {collapsed && (
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#222222] rounded-lg text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                      {item.label}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Profile + collapse */}
        <div className="border-t border-[#ebebeb] p-3 space-y-1 flex-shrink-0">
          {/* Profile link */}
          <Link href="/app/profile">
            <div className={cn(
              "flex items-center gap-3 rounded-xl h-11 cursor-pointer group hover:bg-[#f7f7f7] transition-colors",
              collapsed ? "px-0 justify-center" : "px-3"
            )}>
              <Avatar className="h-7 w-7 rounded-full border border-[#ebebeb] flex-shrink-0">
                <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                <AvatarFallback className="bg-[#ff385c] text-white text-xs font-bold">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[#222222] truncate">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="text-[10px] text-[#929292]">
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
              "w-full flex items-center gap-2 rounded-xl h-9 text-[#929292] hover:bg-[#f7f7f7] hover:text-[#6a6a6a] transition-all",
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
        <header className="h-16 bg-white border-b border-[#ebebeb] px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
          {/* Mobile: logo */}
          <div className="md:hidden">
            <TripMateLogo size="sm" />
          </div>
          {/* Desktop: page breadcrumb placeholder */}
          <div className="hidden md:block" />

          {/* Right: profile */}
          <Link href="/app/profile">
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-semibold text-[#222222] group-hover:text-[#ff385c] transition-colors flex items-center gap-1.5">
                  {user?.isGuest && (
                    <span className="bg-amber-50 text-amber-600 text-[10px] px-2 py-0.5 rounded-full border border-amber-200 font-bold">
                      GUEST
                    </span>
                  )}
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="text-[10px] text-[#929292] uppercase tracking-wide font-medium">
                  {user?.isGuest ? "Trial Plan" : "Member"}
                </span>
              </div>
              <Avatar className="h-9 w-9 rounded-full border-2 border-[#ebebeb] group-hover:border-[#ff385c] transition-all duration-200">
                <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                <AvatarFallback className="bg-[#ff385c] text-white text-xs font-bold">
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
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-4 left-4 right-4 z-50">
          <div className="bg-white border border-[#ebebeb] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] p-1.5 flex items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href} className="flex-1">
                  <div className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all duration-150",
                    isActive
                      ? "text-[#ff385c] bg-[#fff1f3]"
                      : "text-[#929292] hover:text-[#6a6a6a]"
                  )}>
                    <item.icon className="h-5 w-5" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
                  </div>
                </Link>
              );
            })}
            <Link href="/app/profile" className="flex-1">
              <div className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[#929292] hover:text-[#6a6a6a] transition-all">
                <Avatar className="h-5 w-5 rounded-full border border-[#ebebeb]">
                  <AvatarImage src={user?.profileImageUrl} />
                  <AvatarFallback className="bg-[#ff385c] text-white text-[8px] font-bold">
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
