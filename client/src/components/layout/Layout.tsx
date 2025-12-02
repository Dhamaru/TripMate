import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Home,
  Compass,
  Grid,
  User,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", icon: Home, href: "/app/home" },
  { label: "Trips", icon: Compass, href: "/app/trips" },
  { label: "Tools", icon: Grid, href: "/app/tools" },
  { label: "Feedback", icon: MessageSquare, href: "/app/feedback" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth() as any;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-black text-white">
      {/* Sidebar - Desktop */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-[#0d1117] border-r border-gray-800 transition-all duration-300 ease-in-out fixed left-0 top-16 bottom-0 z-40",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Sidebar Content */}
        <div className="flex-1 flex flex-col pt-4">
          {/* Navigation Items */}
          <nav className="flex-1 px-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-md transition-all cursor-pointer relative group",
                      sidebarCollapsed ? "px-2 py-2 justify-center" : "px-3 py-2",
                      isActive
                        ? "bg-[#1f6feb] text-white" // GitHub blue
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>
                    )}
                    {/* Tooltip for collapsed state */}
                    {sidebarCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {item.label}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Collapse Toggle Button - At Bottom */}
          <div className="p-3 border-t border-gray-800">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={cn(
                "w-full flex items-center gap-2 rounded-md text-gray-400 hover:bg-gray-800 hover:text-white transition-all",
                sidebarCollapsed ? "px-2 py-2 justify-center" : "px-3 py-2"
              )}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <>
                  <ChevronLeft className="h-5 w-5" />
                  <span className="font-medium text-sm">Collapse sidebar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className={cn(
        "flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out",
        "md:ml-64", // Default margin
        sidebarCollapsed && "md:ml-16" // Collapsed margin
      )}>
        {/* Top Navigation Bar - Glass Effect */}
        <header className="h-16 bg-[#010409]/80 backdrop-blur-md border-b border-gray-800 px-4 flex items-center justify-between sticky top-0 z-50">
          {/* Left: Hamburger & Logo */}
          <div className="flex items-center gap-4">
            <button
              className="p-1 text-gray-400 hover:text-white border border-gray-700 rounded-md hover:border-gray-500 transition-colors"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <TripMateLogo size="sm" />
            </div>
          </div>

          {/* Right: Profile */}
          <Link href="/app/profile">
            <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-bold text-white">
                  {user?.firstName} {user?.lastName}
                </span>
              </div>
              <Avatar className="h-8 w-8 rounded-full overflow-hidden border border-gray-700">
                <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                <AvatarFallback className="bg-[#1f6feb] text-white text-xs">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
            </div>
          </Link>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 bg-[#0d1117]">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#010409]/90 backdrop-blur-lg border-t border-gray-800 px-4 flex items-center justify-around z-50">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors",
                    isActive ? "text-[#58a6ff]" : "text-gray-400"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", isActive && "fill-current")} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
          <Link href="/app/profile">
            <div className="flex flex-col items-center justify-center gap-1 w-16 h-full">
              <Avatar className="h-6 w-6 rounded-full overflow-hidden border border-gray-700">
                <AvatarImage src={user?.profileImageUrl} />
                <AvatarFallback className="bg-[#1f6feb] text-white text-xs">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] font-medium text-gray-400">Profile</span>
            </div>
          </Link>
        </nav>
      </div>
    </div>
  );
}
