import React, { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Home,
  Compass,
  Grid,
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("tm:sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      document.body.classList.toggle("sidebar-expanded", !sidebarCollapsed);
      localStorage.setItem("tm:sidebarCollapsed", sidebarCollapsed ? "1" : "0");
    } catch { }
  }, [sidebarCollapsed]);

  const desktopMarginClass = sidebarCollapsed ? "md:ml-16" : "md:ml-64";

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <div className="flex min-h-screen w-full bg-[#010409] text-white">
      <aside
        aria-label="Primary"
        className={cn(
          "hidden md:flex flex-col bg-[#0d1117] border-r border-gray-800 transition-all duration-200 ease-in-out fixed left-0 top-0 bottom-0 z-40",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        <div
          className={cn(
            "h-16 flex items-center border-b border-gray-800",
            sidebarCollapsed ? "justify-center px-2" : "px-4 gap-3"
          )}
        >
          <TripMateLogo size="sm" />
          {!sidebarCollapsed && (
            <span className="font-bold text-white whitespace-nowrap">TripMate</span>
          )}
        </div>

        <div className="flex-1 flex flex-col pt-4">
          <nav className="flex-1 px-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <a
                    className={cn(
                      "flex items-center gap-3 rounded-md transition-all cursor-pointer relative group",
                      sidebarCollapsed ? "px-2 py-2 justify-center" : "px-3 py-2",
                      isActive
                        ? "bg-[#1f6feb] text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="font-medium text-sm whitespace-nowrap">
                        {item.label}
                      </span>
                    )}
                    {sidebarCollapsed && (
                      <span
                        role="tooltip"
                        className="absolute left-full ml-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50"
                      >
                        {item.label}
                      </span>
                    )}
                  </a>
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t border-gray-800">
            <button
              onClick={() => setSidebarCollapsed((s) => !s)}
              className={cn(
                "w-full flex items-center gap-2 rounded-md text-gray-400 hover:bg-gray-800 hover:text-white transition-all",
                sidebarCollapsed ? "px-2 py-2 justify-center" : "px-3 py-2"
              )}
              aria-expanded={!sidebarCollapsed}
              aria-pressed={!sidebarCollapsed}
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

      <div
        className={cn(
          "md:hidden fixed inset-0 z-50 transition-transform",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
        <div className="relative w-64 h-full bg-[#0d1117] border-r border-gray-800">
          <div className="h-16 flex items-center px-4 border-b border-gray-800">
            <TripMateLogo size="sm" />
            <span className="font-bold text-white ml-3">TripMate</span>
          </div>
          <nav className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <a
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                      isActive
                        ? "bg-[#1f6feb] text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    )}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium text-sm">{item.label}</span>
                  </a>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div
        className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-200 ease-in-out",
          desktopMarginClass
        )}
      >
        <header className="h-16 bg-[#010409]/80 backdrop-blur-md border-b border-gray-800 px-4 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <button
              className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:bg-gray-800"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden md:flex flex-col items-end mr-2">
              <span className="text-sm font-bold text-white">
                {user?.firstName} {user?.lastName}
              </span>
            </span>

            <Link href="/app/profile">
              <a className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                <Avatar className="h-8 w-8 rounded-full overflow-hidden border border-gray-700">
                  <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                  <AvatarFallback className="bg-[#1f6feb] text-white text-xs">
                    {user?.firstName?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
              </a>
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 bg-[#0d1117]">
          {children}
        </main>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#010409]/90 backdrop-blur-lg border-t border-gray-800 px-2 flex items-center justify-around z-50">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors",
                    isActive ? "text-[#58a6ff]" : "text-gray-400"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </a>
              </Link>
            );
          })}

          <Link href="/app/profile">
            <a className="flex flex-col items-center justify-center gap-1 w-16 h-full">
              <Avatar className="h-6 w-6 rounded-full overflow-hidden border border-gray-700">
                <AvatarImage src={user?.profileImageUrl} />
                <AvatarFallback className="bg-[#1f6feb] text-white text-xs">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] font-medium text-gray-400">Profile</span>
            </a>
          </Link>
        </nav>
      </div>
    </div>
  );
}
