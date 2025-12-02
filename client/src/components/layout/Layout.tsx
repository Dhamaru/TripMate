import React from "react";
import { useLocation, Link } from "wouter";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Home,
  Map,
  Grid,
  User,
  LogOut,
  Settings,
  Compass,
  Menu
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { label: "Home", icon: Home, href: "/app/home" },
  { label: "Trips", icon: Compass, href: "/app/planner" }, // Or /app/trips if that exists, using planner for now as "Trips"
  { label: "Tools", icon: Grid, href: "/app/tools" },
  { label: "Profile", icon: User, href: "/app/profile" },
];

function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth() as any;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-16">
        <SidebarMenu className="p-2">
          {NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={location === item.href || location.startsWith(item.href)}
                tooltip={item.label}
                className="h-12"
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <Avatar className="h-8 w-8 rounded-full overflow-hidden bg-muted">
            <AvatarImage src={user?.profileImageUrl} className="object-cover" />
            <AvatarFallback>{user?.firstName?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">{user?.firstName}</span>
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function BottomNav() {
  const [location] = useLocation();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border h-16 px-4 flex items-center justify-around md:hidden safe-area-bottom">
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href || location.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href}>
            <div className={cn(
              "flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}>
              <item.icon className={cn("h-6 w-6", isActive && "fill-current")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function CustomSidebarTrigger() {
  const { toggleSidebar } = useSidebar();
  return (
    <button onClick={toggleSidebar} className="flex items-center gap-2 hover:opacity-80 transition-opacity p-2">
      <Menu className="h-6 w-6" />
    </button>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar - Hidden on Mobile */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>

      <main className="flex-1 flex flex-col min-h-screen relative overflow-hidden">
        {/* Desktop Header */}
        <header className="hidden md:flex h-16 items-center justify-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 sticky top-0 z-10 relative">
          <div className="absolute left-6">
            <CustomSidebarTrigger />
          </div>
          <TripMateLogo size="sm" />
        </header>

        {/* Mobile Header (Optional, maybe just Logo) */}
        <header className="md:hidden h-14 flex items-center justify-center border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <TripMateLogo size="sm" />
        </header>

        <div className="flex-1 overflow-y-auto pb-20 md:pb-6 p-4 md:p-6 scroll-smooth">
          {children}
        </div>

        <BottomNav />
      </main>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
}
