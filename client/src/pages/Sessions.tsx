import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface SessionItem {
  id: string;
  device?: string;
  ip?: string;
  userAgent?: string;
  expiresAt?: string;
}

export default function Sessions() {
  const { user } = useAuth() as { user: any };
  const [, navigate] = useLocation();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  async function loadSessions() {
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch("/api/v1/auth/sessions", {
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setSessions(Array.isArray(json) ? json : []);
    } catch {
      // Was a silent failure that rendered "No active sessions."
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }

  async function revokeSession(id: string) {
    const res = await apiRequest("POST", `/api/v1/auth/sessions/${id}/revoke`);
    if (!res.ok) return;
    if (id === "current") {
      // Revoking the current session clears the auth cookie server-side —
      // reload so the app picks up the now-logged-out state and redirects
      // to sign-in, instead of leaving the UI showing a session that no
      // longer actually exists.
      window.location.href = "/signin";
      return;
    }
    loadSessions();
  }

  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div className="min-h-screen bg-muted text-foreground">
      <main className="py-8 px-4 max-w-3xl mx-auto">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Active Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : loadFailed ? (
              <div className="text-muted-foreground">
                Couldn't load your sessions.{" "}
                <button
                  onClick={loadSessions}
                  className="text-[var(--ink-blue)] font-semibold hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-muted-foreground">No active sessions.</div>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border"
                  >
                    <div className="text-sm">
                      <div>{s.device || "web"}</div>
                      <div className="text-muted-foreground">
                        {s.ip} · {(s.expiresAt || "").replace("T", " ").slice(0, 19)}
                      </div>
                      <div className="text-muted-foreground truncate max-w-xl">{s.userAgent}</div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => revokeSession(s.id)}>
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
