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
  ChevronDown,
  Sun,
  Moon,
  ListChecks,
  DollarSign,
  CloudSun,
  Languages,
  Map,
  Siren,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { WifiOff, Download } from "lucide-react";

// Tools no longer has its own index page — it was one extra click to an
// intermediate grid that just linked back out to these same six routes.
// A dropdown surfaces them directly from the sidebar (user request this
// session), same pattern Journal/Trips already use for direct navigation.
const TOOL_ITEMS = [
  { label: "Packing List", icon: ListChecks, href: "/app/packing" },
  { label: "Currency Converter", icon: DollarSign, href: "/app/currency" },
  { label: "Weather Forecast", icon: CloudSun, href: "/app/weather" },
  { label: "Translator", icon: Languages, href: "/app/translate" },
  { label: "Offline Maps", icon: Map, href: "/app/maps" },
  { label: "Emergency Info", icon: Siren, href: "/app/emergency" },
];

const NAV_ITEMS = [
  { label: "Home", icon: Home, href: "/app/home" },
  { label: "Trips", icon: Compass, href: "/app/trips" },
  { label: "Journal", icon: Book, href: "/app/journal" },
  { label: "Tools", icon: Grid, children: TOOL_ITEMS },
  { label: "Feedback", icon: MessageSquare, href: "/app/feedback" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const isOnline = useOnlineStatus();
  const { canInstall, promptInstall } = usePwaInstall();
  // The Maps page manages its own full-height "focus mode" layout (map fills
  // the viewport, a bottom sheet holds secondary controls) — the standard
  // padded/max-width/bottom-nav-clearance wrapper below would fight that, so
  // it opts out and takes the full content area itself.
  const isFullBleed = location.startsWith("/app/maps");
  const isOnToolRoute = TOOL_ITEMS.some(
    (t) => location === t.href || location.startsWith(t.href + "/"),
  );
  // Starts open if you're already on one of its routes (land on /app/weather
  // directly, e.g. from a bookmark, and the sidebar shows where you are
  // instead of a collapsed group with no active-state visible at all).
  const [toolsOpen, setToolsOpen] = useState(isOnToolRoute);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  // The skip link only becomes visible after a real Tab press. Browsers
  // (especially an installed PWA on launch) put focus on the first
  // focusable element programmatically, which was painting the skip link
  // over the logo even with :focus-visible.
  const [kbdNav, setKbdNav] = useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        setKbdNav(true);
        window.removeEventListener("keydown", onKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Skip link — UX-audit finding: keyboard/screen-reader users had no
          way past the full sidebar; every page started with a 5-6-tab
          walk through Home/Trips/Journal/Tools/Feedback before reaching
          content. Visually hidden until focused, first element in the
          DOM so it's always the first Tab stop. */}
      {kbdNav && (
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-1/2 focus:-translate-x-1/2 focus:z-[120] focus:rounded-lg focus:bg-[var(--amber)] focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
        >
          Skip to content
        </a>
      )}

      {/* Offline banner — UX-audit finding: previously nothing detected
          offline at all; the app just spun forever then bounced to
          sign-in. Fixed overlay (not part of layout flow) so it doesn't
          reshuffle the sidebar/header on every connectivity flicker. */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[110] bg-[var(--stamp-red-deep)] text-white text-xs font-semibold flex items-center justify-center gap-2 py-1.5"
            role="status"
          >
            <WifiOff className="w-3.5 h-3.5" />
            You&apos;re offline — showing cached data, some actions may not work.
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sidebar ─────────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] transition-all duration-300 ease-in-out fixed left-0 top-0 bottom-0 z-40",
          collapsed ? "w-[60px]" : "w-[240px]",
        )}
      >
        {/* Logo bar */}
        <div
          className={cn(
            "h-16 flex items-center border-b border-[hsl(var(--sidebar-border))] flex-shrink-0 transition-all duration-300",
            collapsed ? "justify-center px-0" : "px-5",
          )}
        >
          {collapsed ? (
            <TripMateLogo size="sm" showText={false} />
          ) : (
            <div className="flex items-center gap-2.5">
              <TripMateLogo size="sm" showText={false} />
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
        <nav className="flex-1 px-2 py-5 space-y-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_ITEMS.map((item) => {
            if (item.children) {
              // Tools has no page of its own anymore — it was one extra
              // click to a grid that just linked back out to these same
              // routes. Collapsed-sidebar mode has no room for an inline
              // submenu, so it falls back to the first tool.
              const isGroupActive = isOnToolRoute;
              return (
                <div key={item.label}>
                  {collapsed ? (
                    <Link href={item.children[0].href}>
                      <div
                        className={cn(
                          "flex items-center justify-center h-10 cursor-pointer relative group rounded-lg transition-all duration-150",
                          isGroupActive
                            ? "text-[var(--ink-blue)] bg-[var(--amber-dim)]"
                            : "text-[hsl(var(--foreground)/0.62)] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
                        )}
                        title={item.label}
                        aria-current={isGroupActive ? "page" : undefined}
                      >
                        <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                      </div>
                    </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setToolsOpen((v) => !v)}
                        aria-expanded={toolsOpen}
                        className={cn(
                          "w-full flex items-center gap-3 h-10 px-3 cursor-pointer relative group rounded-lg transition-all duration-150",
                          isGroupActive
                            ? "text-[var(--ink-blue)] bg-[var(--amber-dim)]"
                            : "text-[hsl(var(--foreground)/0.62)] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
                        )}
                      >
                        {isGroupActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--amber)] rounded-r-full" />
                        )}
                        <item.icon
                          className={cn(
                            "h-[18px] w-[18px] flex-shrink-0 transition-all duration-150",
                            isGroupActive ? "text-[var(--ink-blue)]" : "group-hover:scale-110",
                          )}
                        />
                        <span className="text-[13px] font-medium tracking-wide whitespace-nowrap font-sans-clean flex-1 text-left">
                          {item.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200",
                            toolsOpen && "rotate-180",
                          )}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {toolsOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <div className="pl-[34px] pr-1 py-0.5 space-y-0.5">
                              {item.children.map((tool) => {
                                const toolActive =
                                  location === tool.href || location.startsWith(tool.href + "/");
                                return (
                                  <Link key={tool.href} href={tool.href}>
                                    <div
                                      aria-current={toolActive ? "page" : undefined}
                                      className={cn(
                                        "flex items-center gap-2.5 h-8 px-2 rounded-md cursor-pointer text-[12.5px] font-medium transition-colors duration-150",
                                        toolActive
                                          ? "text-[var(--ink-blue)] bg-[var(--amber-dim)]"
                                          : "text-[hsl(var(--foreground)/0.55)] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
                                      )}
                                    >
                                      <tool.icon className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="whitespace-nowrap font-sans-clean">
                                        {tool.label}
                                      </span>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
              );
            }

            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 h-10 cursor-pointer relative group transition-all duration-150 rounded-lg",
                    collapsed ? "px-0 justify-center" : "px-3",
                    isActive
                      ? "text-[var(--ink-blue)] bg-[var(--amber-dim)]"
                      : // Senior-review finding: --muted-foreground reads fine
                        // for body text but was borderline invisible on an
                        // 18px icon glyph against the dark ground — icons
                        // need more presence than prose at the same color.
                        "text-[hsl(var(--foreground)/0.62)] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
                  )}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--amber)] rounded-r-full" />
                  )}
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] flex-shrink-0 transition-all duration-150",
                      isActive ? "text-[var(--ink-blue)]" : "group-hover:scale-110",
                    )}
                  />
                  {!collapsed && (
                    <span className="text-[13px] font-medium tracking-wide whitespace-nowrap font-sans-clean">
                      {item.label}
                    </span>
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg text-[11px] text-[hsl(var(--foreground))] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-[var(--shadow-card)]">
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
          {/* Install app — UX-audit finding: the app is a fully working
              installable PWA and nothing ever surfaced that to a user.
              Only rendered once the browser has actually offered
              (beforeinstallprompt fired), so this never shows a dead
              button on a platform/browser that doesn't support it. */}
          {canInstall && (
            <button
              onClick={promptInstall}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg h-9 text-[var(--ink-blue-bright)] hover:bg-[hsl(var(--muted))] transition-all",
                collapsed ? "px-0 justify-center" : "px-3",
              )}
              title="Install TripMate"
            >
              <Download className="h-[16px] w-[16px] flex-shrink-0" />
              {!collapsed && (
                <span className="text-[12px] font-sans-clean font-medium">Install app</span>
              )}
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-lg h-9 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-all",
              collapsed ? "px-0 justify-center" : "px-3",
            )}
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-[16px] w-[16px] text-[var(--ink-blue)] flex-shrink-0" />
            ) : (
              <Moon className="h-[16px] w-[16px] flex-shrink-0" />
            )}
            {!collapsed && (
              <span className="text-[12px] font-sans-clean font-medium">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
            )}
          </button>

          {/* Profile */}
          <Link href="/app/profile">
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-lg h-11 cursor-pointer group hover:bg-[hsl(var(--muted))] transition-colors",
                collapsed ? "px-0 justify-center" : "px-3",
              )}
            >
              <Avatar className="h-7 w-7 rounded-full border border-[hsl(var(--border))] flex-shrink-0">
                <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                <AvatarFallback className="bg-[var(--amber)] text-white text-[11px] font-bold">
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
              collapsed ? "px-0 justify-center" : "px-3",
            )}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="text-[11px] font-sans-clean">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────── */}
      <div
        className={cn(
          "flex-1 flex flex-col h-full transition-all duration-300 ease-in-out min-w-0",
          "md:ml-[240px]",
          collapsed && "md:ml-[60px]",
        )}
      >
        {/* Top bar */}
        <header className="h-16 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-2">
            <TripMateLogo size="sm" showText={false} />
            <span className="font-display text-sm font-bold text-[hsl(var(--foreground))]">
              TripMate
            </span>
          </div>

          <div className="hidden md:block" />

          {/* Right: notifications + user */}
          <div className="flex items-center gap-3">
            {/* Theme toggle — the sidebar one is desktop-only, so mobile
                users had no way to switch themes. */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </button>
            <NotificationBell />
            {/* Product-review finding: this whole block was hidden below
                md, so a guest on mobile — the device most guests would
                actually use — had zero indication anywhere that their
                session was temporary. The GUEST tag now renders at every
                width; only the name/"Trial" text stays desktop-only. */}
            <Link href="/app/profile">
              <div className="flex items-center gap-3 cursor-pointer group">
                {user?.isGuest && (
                  <span className="bg-[var(--amber-dim)] text-[var(--ink-blue)] text-[9px] px-2 py-0.5 rounded-full border border-[var(--amber-dim)] font-bold tracking-wide">
                    GUEST
                  </span>
                )}
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-[13px] font-semibold text-[hsl(var(--foreground))] group-hover:text-[var(--ink-blue)] transition-colors flex items-center gap-1.5 font-sans-clean">
                    {user?.firstName} {user?.lastName}
                  </span>
                  <span className="label-xs text-[hsl(var(--muted-foreground))]">
                    {user?.isGuest ? "Trial" : "Member"}
                  </span>
                </div>
                <Avatar className="h-8 w-8 rounded-full border border-[hsl(var(--border))] group-hover:border-[var(--ink-blue)] transition-all duration-200">
                  <AvatarImage src={user?.profileImageUrl} className="object-cover" />
                  <AvatarFallback className="bg-[var(--amber)] text-white text-[11px] font-bold">
                    {user?.firstName?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
              </div>
            </Link>
          </div>
        </header>

        {/* Page content */}
        {/* pb-36 (144px) mobile clearance for the fixed bottom nav AND the
            Atlas FAB, which floats above it (bottom-[88px] + its own 52px
            height = its top edge sits ~140px up) — pb-32 (128px) was 12px
            short, so on any page whose last content lands close to the true
            page bottom, the FAB's tap area silently sat on top of real
            content underneath it (UX-audit finding this session, live-
            measured on Home's quick-actions grid).
            md:pb-20 (80px): the FAB never actually hides at any breakpoint
            (AtlasTriggerButton.tsx has no md:hidden — it just moves to
            bottom-6 on desktop, where its own footprint is still ~76px:
            24px offset + 52px height). md:pb-8 (32px) was well short of
            that, and the FAB was found overlapping Home's "See all"
            control at exactly 768px (live-measured). */}
        <main
          id="main-content"
          tabIndex={-1}
          className={
            isFullBleed ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto pb-36 md:pb-20"
          }
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={isFullBleed ? "w-full h-full" : "px-6 py-7 max-w-5xl mx-auto w-full"}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile tools sheet — the bottom nav has no room for an inline
            submenu, so tapping Tools opens this list instead of jumping
            straight to one tool. */}
        <AnimatePresence>
          {mobileToolsOpen && (
            <>
              <motion.div
                className="md:hidden fixed inset-0 z-[55] bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileToolsOpen(false)}
              />
              <motion.div
                className="md:hidden fixed bottom-0 left-0 right-0 z-[56] bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] rounded-t-2xl shadow-[0_-4px_32px_rgba(0,0,0,0.45)] px-3 pt-2 pb-[92px]"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
              >
                <div className="mx-auto mb-1 h-1 w-9 rounded-full bg-[hsl(var(--border))]" />
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
                  Tools
                </div>
                {TOOL_ITEMS.map((tool) => {
                  const active = location === tool.href || location.startsWith(tool.href + "/");
                  return (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      onClick={() => setMobileToolsOpen(false)}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium",
                          active
                            ? "text-[var(--ink-blue)] bg-[var(--amber-dim)]"
                            : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
                        )}
                      >
                        <tool.icon className="h-[18px] w-[18px] flex-shrink-0" />
                        {tool.label}
                      </div>
                    </Link>
                  );
                })}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-3 left-3 right-3 z-[57]">
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.35)] px-1 py-1.5 flex items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.children != null
                  ? isOnToolRoute
                  : location === item.href || location.startsWith(item.href + "/");

              const inner = (
                <div
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-all duration-150",
                    isActive
                      ? "text-[var(--ink-blue)]"
                      : "text-[hsl(var(--foreground)/0.62)] hover:text-[hsl(var(--foreground))]",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px]",
                      isActive && "drop-shadow-[0_0_6px_rgb(var(--ink-blue-rgb)/0.6)]",
                    )}
                  />
                  <span className="label-xs">{item.label}</span>
                </div>
              );

              if (item.children) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    className="flex-1"
                    aria-expanded={mobileToolsOpen}
                    onClick={() => setMobileToolsOpen((v) => !v)}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <Link key={item.label} href={item.href!} className="flex-1">
                  {inner}
                </Link>
              );
            })}
            <Link href="/app/profile" className="flex-1">
              <div className="flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all">
                <Avatar className="h-[18px] w-[18px] rounded-full border border-[hsl(var(--border))]">
                  <AvatarImage src={user?.profileImageUrl} />
                  <AvatarFallback className="bg-[var(--amber)] text-white text-[8px] font-bold">
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
