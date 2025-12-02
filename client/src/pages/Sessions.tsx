import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TripMateLogo } from "@/components/TripMateLogo";
import { useLocation } from "wouter";

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

  async function loadSessions() {
    setIsLoading(true);
    try {
      const token = (window as any).__authToken || null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/v1/auth/sessions', { credentials: 'include', headers });
      if (res.ok) {
        const json = await res.json();
        setSessions(Array.isArray(json) ? json : []);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function revokeSession(id: string) {
    const token = (window as any).__authToken || null;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`/api/v1/auth/sessions/${id}/revoke`, { method: 'POST', credentials: 'include', headers });
    if (res.ok) loadSessions();
  }

  useEffect(() => { loadSessions(); }, []);

  return (
    <div className="min-h-screen bg-ios-darker text-white">


      <main className="py-8 px-4 max-w-3xl mx-auto">
        <Card className="bg-ios-card border-ios-gray">
          <CardHeader>
            <CardTitle className="text-white">Active Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-ios-gray">Loading…</div>
            ) : sessions.length === 0 ? (
              <div className="text-ios-gray">No active sessions.</div>
            ) : (
              <div className="space-y-3">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-md border border-ios-gray">
                    <div className="text-sm">
                      <div>{s.device || 'web'}</div>
                      <div className="text-ios-gray">{s.ip} · {(s.expiresAt || '').replace('T', ' ').slice(0, 19)}</div>
                      <div className="text-ios-gray truncate max-w-xl">{s.userAgent}</div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => revokeSession(s.id)}>Revoke</Button>
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
