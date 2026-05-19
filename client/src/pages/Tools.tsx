import { Link } from "wouter";
import { CloudSun, DollarSign, Languages, Siren, ListChecks, Map, ArrowRight } from "lucide-react";

const TOOLS = [
  { title: "Packing List",       description: "Smart checklists for your trips",          icon: ListChecks, href: "/app/packing",   tint: "icon-tint-blue",   num: "01" },
  { title: "Currency Converter", description: "Real-time exchange rates",                  icon: DollarSign, href: "/app/currency",  tint: "icon-tint-green",  num: "02" },
  { title: "Weather Forecast",   description: "7-day forecasts for any destination",       icon: CloudSun,   href: "/app/weather",   tint: "icon-tint-amber",  num: "03" },
  { title: "Translator",         description: "Translate text and voice",                  icon: Languages,  href: "/app/translate", tint: "icon-tint-purple", num: "04" },
  { title: "Offline Maps",       description: "Download maps for offline use",             icon: Map,        href: "/app/maps",      tint: "icon-tint-orange", num: "05" },
  { title: "Emergency Info",     description: "Local emergency numbers & services",        icon: Siren,      href: "/app/emergency", tint: "icon-tint-red",    num: "06" },
];

export default function Tools() {
  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="animate-fade-up">
        <p className="label-xs text-[hsl(var(--muted-foreground))] mb-1">Utilities</p>
        <h1 className="font-display text-4xl font-bold text-[hsl(var(--foreground))] leading-tight">
          Travel<br />
          <span className="italic font-normal text-[hsl(var(--muted-foreground))]">Tools</span>
        </h1>
      </div>

      {/* ── Tool list ──────────────────────────────────── */}
      <div className="space-y-2 animate-fade-up animate-fade-up-delay-1">
        {TOOLS.map((tool) => (
          <Link key={tool.title} href={tool.href}>
            <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] px-5 py-4 flex items-center gap-5 card-hover-glow cursor-pointer group transition-all">
              {/* Number */}
              <span className="stat-display text-2xl text-[hsl(var(--muted-foreground))]/30 group-hover:text-[var(--amber)]/50 transition-colors w-8 flex-shrink-0 leading-none select-none">
                {tool.num}
              </span>

              {/* Icon */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tool.tint} group-hover:scale-110 transition-transform duration-200`}>
                <tool.icon className="w-5 h-5" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold text-[hsl(var(--foreground))] font-sans-clean">{tool.title}</h3>
                <p className="text-[hsl(var(--muted-foreground))] text-[12px] mt-0.5 font-sans-clean">{tool.description}</p>
              </div>

              {/* Arrow */}
              <ArrowRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[var(--amber)] group-hover:translate-x-1 transition-all duration-150 flex-shrink-0" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
