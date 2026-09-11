import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Settings, X, Trash2, CheckSquare, Square } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useSocket } from "@/hooks/useSocket";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";
import { NOTIFICATION_TYPES } from "@shared/schema";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  count?: number;
  read: boolean;
  createdAt: string;
}

type NotificationsPage = {
  notifications: NotificationItem[];
  unreadCount: number;
  hasMore?: boolean;
};

const FILTERS = ["all", "unread"] as const;
type Filter = (typeof FILTERS)[number];

function keyFor(filter: Filter) {
  return ["/api/v1/notifications", filter] as const;
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
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data } = useQuery<NotificationsPage>({
    queryKey: keyFor(filter),
    queryFn: async () => {
      const qs = filter === "unread" ? "?read=unread" : "";
      const res = await apiRequest("GET", `/api/v1/notifications${qs}`);
      return res.json();
    },
    // Cheap query, and read-state drifts between tabs/devices otherwise.
    refetchOnWindowFocus: true,
  });

  // Shares the same cache entry Profile.tsx reads/writes for the rest of the
  // account form, so a mute toggled here doesn't go stale if the user later
  // opens Profile in the same session (and vice versa).
  const { data: userData } = useQuery<User>({ queryKey: ["/api/v1/auth/user"] });
  const mutedTypes = (userData as any)?.mutedNotificationTypes ?? [];

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const hasMore = data?.hasMore ?? false;

  // "All" and "Unread" are two SEPARATE react-query cache entries (the
  // filter is part of the key). Every mutation below used to patch only
  // whichever tab happened to be open at the moment — so a notification
  // that arrived (or got marked read) while "Unread" was the active tab
  // updated that cache but left "All"'s cache stale until its next
  // refetch, and vice versa. Live-reported: a new notification showed up
  // under Unread but not under All. Every event now updates both caches
  // unconditionally, whichever one is currently mounted or not.
  const patchAll = (updater: (prev: NotificationsPage | undefined) => NotificationsPage) => {
    for (const f of FILTERS) queryClient.setQueryData(keyFor(f), updater);
  };

  // Live push: a new notification (or a grouped bump) arrives over the
  // socket the instant it's created server-side. Further listeners keep
  // read-state and deletions in sync when another tab/device changes them.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onNotification = (notif: NotificationItem & { grouped?: boolean }) => {
      patchAll((prev) => {
        const list = prev?.notifications ?? [];
        if (notif.grouped) {
          const rest = list.filter((n) => n.id !== notif.id);
          return { ...prev, notifications: [notif, ...rest], unreadCount: prev?.unreadCount ?? 0 };
        }
        return {
          notifications: [notif, ...list],
          unreadCount: (prev?.unreadCount ?? 0) + 1,
          hasMore: prev?.hasMore ?? false,
        };
      });
      // The unread-only cache should never carry an already-read row, and a
      // freshly grouped bump is still unread — drop it back in there too.
      if (notif.grouped) {
        queryClient.setQueryData(keyFor("unread"), (prev: NotificationsPage | undefined) => {
          const list = prev?.notifications ?? [];
          if (list.some((n) => n.id === notif.id) || notif.read) return prev as NotificationsPage;
          return { ...(prev as NotificationsPage), notifications: [notif, ...list] };
        });
      }
      toast({ title: notif.title, description: notif.message });
    };

    const onRead = (payload: { id: string | "all" }) => {
      patchAll((prev) => {
        const list = prev?.notifications ?? [];
        if (payload.id === "all") {
          return {
            ...(prev as NotificationsPage),
            notifications: list.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          };
        }
        const wasUnread = list.some((n) => n.id === payload.id && !n.read);
        return {
          ...(prev as NotificationsPage),
          notifications: list.map((n) => (n.id === payload.id ? { ...n, read: true } : n)),
          unreadCount: wasUnread
            ? Math.max(0, (prev?.unreadCount ?? 1) - 1)
            : (prev?.unreadCount ?? 0),
        };
      });
      // A read item has no place in the unread-only list.
      queryClient.setQueryData(keyFor("unread"), (prev: NotificationsPage | undefined) => {
        const list = prev?.notifications ?? [];
        if (payload.id === "all")
          return { ...(prev as NotificationsPage), notifications: [], unreadCount: 0 };
        return {
          ...(prev as NotificationsPage),
          notifications: list.filter((n) => n.id !== payload.id),
        };
      });
    };

    const onDeleted = (payload: { id: string | string[] | "all" }) => {
      const ids =
        payload.id === "all" ? null : Array.isArray(payload.id) ? payload.id : [payload.id];
      patchAll((prev) => {
        const list = prev?.notifications ?? [];
        const kept = ids ? list.filter((n) => !ids.includes(n.id)) : [];
        const removedUnread = list.filter(
          (n) => (ids ? ids.includes(n.id) : true) && !n.read,
        ).length;
        return {
          ...(prev as NotificationsPage),
          notifications: kept,
          unreadCount: Math.max(0, (prev?.unreadCount ?? 0) - removedUnread),
        };
      });
    };

    socket.on("notification", onNotification);
    socket.on("notification-read", onRead);
    socket.on("notification-deleted", onDeleted);
    return () => {
      socket.off("notification", onNotification);
      socket.off("notification-read", onRead);
      socket.off("notification-deleted", onDeleted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketRef, queryClient, toast]);

  const markRead = async (id: string) => {
    patchAll((prev) => {
      const list = prev?.notifications ?? [];
      const wasUnread = list.some((n) => n.id === id && !n.read);
      return {
        ...(prev as NotificationsPage),
        notifications: list.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: wasUnread
          ? Math.max(0, (prev?.unreadCount ?? 1) - 1)
          : (prev?.unreadCount ?? 0),
      };
    });
    queryClient.setQueryData(keyFor("unread"), (prev: NotificationsPage | undefined) => ({
      ...(prev as NotificationsPage),
      notifications: (prev?.notifications ?? []).filter((n) => n.id !== id),
    }));
    await apiRequest("POST", `/api/v1/notifications/${id}/read`);
  };

  const markAllRead = async () => {
    patchAll((prev) => ({
      ...(prev as NotificationsPage),
      notifications: (prev?.notifications ?? []).map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    queryClient.setQueryData(keyFor("unread"), (prev: NotificationsPage | undefined) => ({
      ...(prev as NotificationsPage),
      notifications: [],
    }));
    await apiRequest("POST", "/api/v1/notifications/read-all");
  };

  // Notifications are never auto-cleared — these are the only paths that
  // remove one, and both require the user to explicitly ask for it.
  const deleteOne = async (id: string) => {
    patchAll((prev) => {
      const list = prev?.notifications ?? [];
      const removedUnread = list.some((n) => n.id === id && !n.read) ? 1 : 0;
      return {
        ...(prev as NotificationsPage),
        notifications: list.filter((n) => n.id !== id),
        unreadCount: Math.max(0, (prev?.unreadCount ?? 0) - removedUnread),
      };
    });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await apiRequest("DELETE", `/api/v1/notifications/${id}`);
  };

  const deleteSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    patchAll((prev) => {
      const list = prev?.notifications ?? [];
      const removedUnread = list.filter((n) => ids.includes(n.id) && !n.read).length;
      return {
        ...(prev as NotificationsPage),
        notifications: list.filter((n) => !ids.includes(n.id)),
        unreadCount: Math.max(0, (prev?.unreadCount ?? 0) - removedUnread),
      };
    });
    setSelected(new Set());
    setSelectMode(false);
    await apiRequest("POST", "/api/v1/notifications/delete", { ids });
  };

  const clearAll = async () => {
    if (!window.confirm("Clear all notifications? This can't be undone.")) return;
    patchAll(() => ({ notifications: [], unreadCount: 0, hasMore: false }));
    setSelected(new Set());
    setSelectMode(false);
    await apiRequest("POST", "/api/v1/notifications/delete", {});
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadMore = async () => {
    if (notifications.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const oldest = notifications[notifications.length - 1];
      const res = await apiRequest(
        "GET",
        `/api/v1/notifications?before=${encodeURIComponent(oldest.createdAt)}${filter === "unread" ? "&read=unread" : ""}`,
      );
      const page = await res.json();
      queryClient.setQueryData(keyFor(filter), (prev: NotificationsPage | undefined) => ({
        ...(prev as NotificationsPage),
        notifications: [...(prev?.notifications ?? []), ...page.notifications],
        hasMore: page.hasMore,
      }));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleMute = async (type: string, muted: boolean) => {
    const next = muted ? [...mutedTypes, type] : mutedTypes.filter((t: string) => t !== type);
    // Optimistic — this is a low-stakes preference toggle, worth the snappy
    // feel over waiting on the round trip.
    queryClient.setQueryData(["/api/v1/auth/user"], (prev: any) => ({
      ...prev,
      mutedNotificationTypes: next,
    }));
    await apiRequest("PUT", "/api/v1/auth/user", { mutedNotificationTypes: next });
  };

  // Clicking used to mark-read-and-immediately-navigate, so the message
  // (clamped to 2 lines in the list) was never actually readable —
  // live-reported. Now the first click expands the row in place to show
  // the full text; a link only navigates from inside the expanded view,
  // as a separate, explicit action.
  const handleClick = (notif: NotificationItem) => {
    if (selectMode) return toggleSelected(notif.id);
    if (!notif.read) markRead(notif.id);
    setExpandedId((cur) => (cur === notif.id ? null : notif.id));
  };

  const handleOpen = (e: React.MouseEvent, link: string) => {
    e.stopPropagation();
    navigate(link);
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) {
          setSettingsOpen(false);
          setExpandedId(null);
          setSelectMode(false);
          setSelected(new Set());
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 rounded-full"
          data-testid="button-notifications"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4 text-[hsl(var(--foreground))]" />
          {unreadCount > 0 && (
            // Fixed: was bg-[var(--amber)] text-black — --amber is aliased
            // to --ink-blue (deep navy), so this was near-invisible black
            // text on navy (design-audit P0). An unread count is an alert,
            // not a primary action — stamp-red + white reads correctly and
            // matches the alert semantic.
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-[var(--stamp-red)] text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-[min(20rem,calc(100vw-1rem))] p-0 max-h-96 overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))]">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Notifications</span>
          <div className="flex items-center gap-3">
            {notifications.length > 0 && !settingsOpen && (
              <button
                onClick={() => {
                  setSelectMode((v) => !v);
                  setSelected(new Set());
                  setExpandedId(null);
                }}
                className="text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
            )}
            {unreadCount > 0 && !selectMode && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-[var(--ink-blue-bright)] hover:underline"
              >
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

        {!settingsOpen && !selectMode && (
          <div className="flex items-center justify-between gap-1 px-3 py-1.5 border-b border-[hsl(var(--border))]">
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-[11px] px-2 py-0.5 rounded-full capitalize transition-colors ${
                    filter === f
                      ? "bg-[var(--ink-blue-bright)] text-white"
                      : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                  }`}
                >
                  {f}
                  {f === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
                </button>
              ))}
            </div>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[var(--stamp-red)]"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {selectMode && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[hsl(var(--border))]">
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
              {selected.size} selected
            </span>
            <button
              onClick={deleteSelected}
              disabled={selected.size === 0}
              className="flex items-center gap-1 text-[11px] text-[var(--stamp-red)] hover:underline disabled:opacity-40 disabled:hover:no-underline"
            >
              <Trash2 className="h-3 w-3" /> Delete selected
            </button>
          </div>
        )}

        {settingsOpen && (
          <div className="px-3 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 space-y-2">
            <p className="text-[11px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
              Notify me about
            </p>
            {NOTIFICATION_TYPES.map((t) => {
              const muted = mutedTypes.includes(t.value);
              return (
                <label
                  key={t.value}
                  className="flex items-center gap-2 text-[13px] text-[hsl(var(--foreground))] cursor-pointer"
                >
                  <Checkbox
                    checked={!muted}
                    onCheckedChange={(checked) => toggleMute(t.value, !checked)}
                  />
                  {t.label}
                </label>
              );
            })}
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
              {filter === "unread" ? "You're all caught up" : "No notifications yet"}
            </div>
          ) : (
            <>
              {notifications.map((notif) => {
                const isExpanded = expandedId === notif.id;
                const isSelected = selected.has(notif.id);
                return (
                  <div
                    key={notif.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleClick(notif)}
                    onKeyDown={(e) => e.key === "Enter" && handleClick(notif)}
                    // --amber-dim is already an rgba() value (12% opacity baked
                    // in) — stacking Tailwind's /20 opacity modifier on top of
                    // an already-rgba custom property doesn't compose reliably
                    // across browsers. Use the token directly; it already
                    // reads as the intended subtle unread highlight.
                    className={`group relative w-full text-left px-3 py-2.5 border-b border-[hsl(var(--border))] last:border-b-0 hover:bg-[hsl(var(--muted))] transition-colors cursor-pointer ${!notif.read ? "bg-[var(--amber-dim)]" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      {selectMode && (
                        <span className="mt-0.5 flex-shrink-0 text-[hsl(var(--muted-foreground))]">
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-[var(--ink-blue-bright)]" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[13px] font-semibold text-[hsl(var(--foreground))]">
                            {notif.title}
                          </span>
                          {!notif.read && !selectMode && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ink-blue-bright)] flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p
                          className={`text-xs text-[hsl(var(--muted-foreground))] mt-0.5 ${isExpanded ? "" : "line-clamp-2"}`}
                        >
                          {notif.message}
                        </p>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                            {timeAgo(notif.createdAt)}
                          </span>
                          {isExpanded &&
                            notif.link &&
                            !selectMode &&
                            // Navigating to the page you're already on is a
                            // no-op — live-reported as "this button doesn't
                            // do anything" from a notification whose link was
                            // the current page. Only offer it when it would
                            // actually go somewhere.
                            (notif.link === location ? (
                              <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                                You're already here
                              </span>
                            ) : (
                              <button
                                onClick={(e) => handleOpen(e, notif.link!)}
                                className="text-[11px] font-medium text-[var(--ink-blue-bright)] hover:underline"
                              >
                                Open &rarr;
                              </button>
                            ))}
                        </div>
                      </div>
                      {!selectMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteOne(notif.id);
                          }}
                          aria-label="Delete notification"
                          className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[hsl(var(--muted-foreground))] hover:text-[var(--stamp-red)] transition-opacity p-0.5 -mr-1 -mt-0.5"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-2.5 text-[12px] text-[var(--ink-blue-bright)] hover:underline disabled:opacity-50"
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
