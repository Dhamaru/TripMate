import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Link } from "wouter";
import { Layout, Globe, Users, Search } from "lucide-react";

type Topic = "start" | "offline" | "sharing";

const TOPICS: { id: Topic; title: string; blurb: string; icon: typeof Layout }[] = [
  {
    id: "start",
    title: "Getting started",
    blurb: "Accounts, planning a trip and finding your way around.",
    icon: Layout,
  },
  {
    id: "offline",
    title: "Offline maps",
    blurb: "Downloading regions and using TripMate without a connection.",
    icon: Globe,
  },
  {
    id: "sharing",
    title: "Trips & sharing",
    blurb: "Inviting people, share links, budgets and packing lists.",
    icon: Users,
  },
];

const FAQS: { topic: Topic; q: string; a: string }[] = [
  {
    topic: "start",
    q: "How do I create a new trip?",
    a: "On Home, tap “Plan a trip” (or “New trip”). Enter where you're starting from, where you're going, your dates and budget, and TripMate drafts a day-by-day plan you can edit.",
  },
  {
    topic: "start",
    q: "Can I try TripMate without an account?",
    a: "Yes, continue as a guest. Guest trips are removed after 30 days, so create a free account to keep them.",
  },
  {
    topic: "start",
    q: "How do I change or reorder activities?",
    a: "Open the trip's Itinerary tab. Drag activities to reorder them, or use the edit and delete buttons on each one.",
  },
  {
    topic: "offline",
    q: "Can I use TripMate offline?",
    a: "Yes. In Offline Maps, download the area you need before you lose signal. Trips you've opened recently also stay readable offline.",
  },
  {
    topic: "offline",
    q: "My downloaded map is blank offline. What happened?",
    a: "The download may not have finished, or your browser cleared its storage. Reconnect, open Offline Maps and download the region again.",
  },
  {
    topic: "sharing",
    q: "How do I plan a trip with friends?",
    a: "Open the trip and tap Trip Team. Invite people by the email they signed up with, as an editor (can change things) or a viewer (can only look).",
  },
  {
    topic: "sharing",
    q: "How does a share link work?",
    a: "Share creates a read-only link to the plan without your budget, notes or expenses. Turning sharing off stops the old link working straight away.",
  },
  {
    topic: "sharing",
    q: "Why isn't an expense in my budget total?",
    a: "Totals add up expenses in the trip's own currency. Expenses in other currencies are listed separately under the total.",
  },
  {
    topic: "start",
    q: "Is my data private?",
    a: "Your trips are only visible to you and the people you invite, unless you turn on a share link. Everything is sent over a secure (HTTPS) connection.",
  },
];

export default function HelpCenter() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<Topic | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter(
      (f) =>
        (!topic || f.topic === topic) &&
        (!q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)),
    );
  }, [query, topic]);

  return (
    <div className="min-h-screen bg-muted text-foreground">
      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-muted/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <div className="cursor-pointer">
                <TripMateLogo size="md" />
              </div>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-20 max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">How can we help you?</h1>
          <div className="max-w-lg mx-auto relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search help"
              placeholder="Search for answers..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 bg-card border-border text-foreground h-12 rounded-xl"
              data-testid="input-help-search"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {TOPICS.map((t) => {
            const Icon = t.icon;
            const active = topic === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopic(active ? null : t.id)}
                aria-pressed={active}
                className="text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                data-testid={`help-topic-${t.id}`}
              >
                <Card
                  className={`h-full bg-card transition-colors ${active ? "border-2 border-[var(--ink-blue-text)]" : "border-border hover:border-[var(--ink-blue-text)]"}`}
                >
                  <CardContent className="p-6 text-center">
                    <div className="w-12 h-12 icon-tint-blue rounded-full flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <h2 className="font-semibold text-lg mb-2 text-foreground">{t.title}</h2>
                    <p className="text-muted-foreground text-sm">{t.blurb}</p>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold mb-2">
            {topic ? TOPICS.find((t) => t.id === topic)!.title : "Frequently asked questions"}
          </h2>
          {shown.length === 0 ? (
            <p className="text-muted-foreground" data-testid="help-no-results">
              Nothing matches “{query}”.{" "}
              <Link href="/contact" className="text-[var(--ink-blue-text)] hover:underline">
                Ask us directly
              </Link>
              .
            </p>
          ) : (
            shown.map((faq) => (
              <Card key={faq.q} className="bg-card border-border">
                <CardContent className="p-6 space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">{faq.q}</h3>
                  <p className="text-muted-foreground">{faq.a}</p>
                </CardContent>
              </Card>
            ))
          )}
          <p className="text-sm text-muted-foreground pt-4">
            Still stuck?{" "}
            <Link href="/contact" className="text-[var(--ink-blue-text)] hover:underline">
              Contact us
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
