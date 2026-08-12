import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useSocket } from "@/hooks/useSocket";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

// Kept in sync with the types actually fired server-side (server/notifications.ts
// call sites) — collaborator-invite, collaborator-removed, itinerary-updated,
// expense-updated, recap-generated.
const NOTIFICATION_TYPES: { value: string; label: string }[] = [
  { value: "collaborator-invite", label: "Added to a trip" },
  { value: "collaborator-removed", label: "Removed from a trip" },
  { value: "itinerary-updated", label: "Itinerary changes" },
  { value: "expense-updated", label: "Expense changes" },
  { value: "recap-generated", label: "Trip recaps" },
];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const socketRef = useSocket();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data } = useQuery<{ notifications: NotificationItem[]; unreadCount: number; hasMore?: boolean }>({
    queryKey: ["/api/v1/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/notifications");
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  // Shares the same cache entry Profile.tsx reads/writes for the rest of the
  // account form, so a mute toggled here doesn't go stale if the user later
  // opens Profile in the same session (and vice versa).
  const { data: userData } = useQuery<User>({ queryKey: ["/api/v1/auth/user"] });
  const mutedTypes = (userData as any)?.mutedNotificationTypes ?? [];

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const hasMore = data?.hasMore ?? false;

  // Live push: a new notification arrives over the socket the instant it's
  // created server-side, no reload or polling needed while the tab is open.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onNotification = (notif: NotificationItem) => {
      queryClient.setQueryData(["/api/v1/notifications"], (prev: any) => ({
        notifications: [notif, ...(prev?.notifications ?? [])],
        unreadCount: (prev?.unreadCount ?? 0) + 1,
        hasMore: prev?.hasMore ?? false,
      }));
      toast({ title: notif.title, description: notif.message });
    };
    socket.on("notification", onNotification);
    return () => { socket.off("notification", onNotification); };
  }, [socketRef, queryClient, toast]);

  const markRead = async (id: string) => {
    await apiRequest("POST", `/api/v1/notifications/${id}/read`);
    queryClient.setQueryData(["/api/v1/notifications"], (prev: any) => ({
      ...prev,
      notifications: (prev?.notifications ?? []).map((n: NotificationItem) => n.id === id ? { ...n, read: true } : n),
      unreadCount: Math.max(0, (prev?.unreadCount ?? 1) - 1),
    }));
  };

  const markAllRead = async () => {
    await apiRequest("POST", "/api/v1/notifications/read-all");
    queryClient.setQueryData(["/api/v1/notifications"], (prev: any) => ({
      ...prev,
      notifications: (prev?.notifications ?? []).map((n: NotificationItem) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  };

  const loadMore = async () => {
    if (notifications.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const oldest = notifications[notifications.length - 1];
      const res = await apiRequest("GET", `/api/v1/notifications?before=${encodeURIComponent(oldest.createdAt)}`);
      const page = await res.json();
      queryClient.setQueryData(["/api/v1/notifications"], (prev: any) => ({
        ...prev,
        notifications: [...(prev?.notifications ?? []), ...page.notifications],
        hasMore: page.hasMore,
      }));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleMute = async (type: string, muted: boolean) => {
    const next = muted
      ? [...mutedTypes, type]
      : mutedTypes.filter((t: string) => t !== type);
    // Optimistic — this is a low-stakes preference toggle, worth the snappy
    // feel over waiting on the round trip.
    queryClient.setQueryData(["/api/v1/auth/user"], (prev: any) => ({ ...prev, mutedNotificationTypes: next }));
    await apiRequest("PUT", "/api/v1/auth/user", { mutedNotificationTypes: next });
  };

  const handleClick = (notif: NotificationItem) => {
    if (!notif.read) markRead(notif.id);
    if (notif.link) navigate(notif.link);
  };

  return (
    <Popover onOpenChange={(open) => { if (!open) setSettingsOpen(false); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full" data-testid="button-notifications">
          <Bell className="h-4 w-4 text-[hsl(var(--foreground))]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-[var(--amber)] text-black text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1rem))] p-0 max-h-96 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))]">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Notifications</span>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-[var(--amber)] hover:underline">
                Mark all read
              </button>
            )}
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label="Notification settings"
              aria-expanded={settingsOpen}
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {settingsOpen && (
          <div className="px-3 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 space-y-2">
            <p className="text-[11px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Notify me about</p>
            {NOTIFICATION_TYPES.map((t) => {
              const muted = mutedTypes.includes(t.value);
              return (
                <label key={t.value} className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground))] cursor-pointer">
                  <Checkbox checked={!muted} onCheckedChange={(checked) => toggleMute(t.value, !checked)} />
                  {t.label}
                </label>
              );
            })}
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
              No notifications yet
            </div>
          ) : (
            <>
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left px-3 py-2.5 border-b border-[hsl(var(--border))] last:border-b-0 hover:bg-[hsl(var(--muted))] transition-colors ${!notif.read ? "bg-[var(--amber-dim)]/20" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[hsl(var(--foreground))]">{notif.title}</span>
                    {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)] flex-shrink-0 mt-1.5" />}
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 line-clamp-2">{notif.message}</p>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1 block">{timeAgo(notif.createdAt)}</span>
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-2.5 text-[12px] text-[var(--amber)] hover:underline disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
