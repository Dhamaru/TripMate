import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useSocket } from "@/hooks/useSocket";
import { useLocation } from "wouter";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

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

  const { data } = useQuery<{ notifications: NotificationItem[]; unreadCount: number }>({
    queryKey: ["/api/v1/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/notifications");
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Live push: a new notification arrives over the socket the instant it's
  // created server-side, no reload or polling needed while the tab is open.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onNotification = (notif: NotificationItem) => {
      queryClient.setQueryData(["/api/v1/notifications"], (prev: any) => ({
        notifications: [notif, ...(prev?.notifications ?? [])].slice(0, 50),
        unreadCount: (prev?.unreadCount ?? 0) + 1,
      }));
    };
    socket.on("notification", onNotification);
    return () => { socket.off("notification", onNotification); };
  }, [socketRef, queryClient]);

  const markRead = async (id: string) => {
    await apiRequest("POST", `/api/v1/notifications/${id}/read`);
    queryClient.setQueryData(["/api/v1/notifications"], (prev: any) => ({
      notifications: (prev?.notifications ?? []).map((n: NotificationItem) => n.id === id ? { ...n, read: true } : n),
      unreadCount: Math.max(0, (prev?.unreadCount ?? 1) - 1),
    }));
  };

  const markAllRead = async () => {
    await apiRequest("POST", "/api/v1/notifications/read-all");
    queryClient.setQueryData(["/api/v1/notifications"], (prev: any) => ({
      notifications: (prev?.notifications ?? []).map((n: NotificationItem) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  };

  const handleClick = (notif: NotificationItem) => {
    if (!notif.read) markRead(notif.id);
    if (notif.link) navigate(notif.link);
  };

  return (
    <Popover>
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
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-[11px] text-[var(--amber)] hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
              No notifications yet
            </div>
          ) : (
            notifications.map((notif) => (
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
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
