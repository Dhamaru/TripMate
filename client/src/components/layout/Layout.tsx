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
    <div className="flex min-h-screen w-full bg-ios-darker text-white">
      {/* Sidebar - Desktop Only */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-ios-dark border-r border-ios-gray transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Sidebar Content */}
        <div className="flex-1 flex flex-col">
          {/* Navigation Items */}
          <nav className="flex-1 px-2 py-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-lg transition-all cursor-pointer relative group",
                      sidebarCollapsed ? "px-3 py-3 justify-center" : "px-3 py-2",
                      isActive
                        ? "bg-ios-blue text-white"
                        : "text-ios-gray hover:bg-ios-card hover:text-white"
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="font-medium whitespace-nowrap">{item.label}</span>
                    )}
                    {/* Tooltip for collapsed state */}
                    {sidebarCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-ios-card border border-ios-gray rounded text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {item.label}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Collapse Toggle Button - At Bottom */}
          <div className="p-2 border-t border-ios-gray">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg text-ios-gray hover:bg-ios-card hover:text-white transition-all",
                sidebarCollapsed ? "px-3 py-3 justify-center" : "px-3 py-2"
              )}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <>
                  <ChevronLeft className="h-5 w-5" />
                  <span className="font-medium">Collapse</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Navigation Bar */}
        <header className="h-16 bg-ios-dark border-b border-ios-gray px-4 flex items-center justify-between sticky top-0 z-50">
          {/* Left: Logo */}
          <div className="flex items-center">
            <TripMateLogo size="sm" />
          </div>

          {/* Right: Profile */}
          <Link href="/app/profile">
            <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-medium text-white">
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="text-xs text-ios-gray">{user?.email}</span>
              </div>
              <Avatar className="h-10 w-10 rounded-full overflow-hidden bg-ios-card border-2 border-ios-gray">
                <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                <AvatarFallback className="bg-ios-blue text-white">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
            </div>
          </Link>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-ios-dark border-t border-ios-gray px-4 flex items-center justify-around z-50">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors",
                    isActive ? "text-ios-blue" : "text-ios-gray"
                  )}
                >
                  <item.icon className={cn("h-6 w-6", isActive && "fill-current")} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
          <Link href="/app/profile">
            <div className="flex flex-col items-center justify-center gap-1 w-16 h-full">
              <Avatar className="h-6 w-6 rounded-full overflow-hidden">
                <AvatarImage src={user?.profileImageUrl} />
                <AvatarFallback className="bg-ios-blue text-white text-xs">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] font-medium text-ios-gray">Profile</span>
            </div>
          </Link>
        </nav>
      </div>
    </div>
  );
}
