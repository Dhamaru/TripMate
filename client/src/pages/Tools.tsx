import { Link } from "wouter";
import { CloudSun, DollarSign, Languages, Siren, ListChecks, Map, ArrowRight } from "lucide-react";

const TOOLS = [
  { title: "Packing List",       description: "Smart checklists for your trips",          icon: ListChecks, href: "/app/packing",   iconBg: "bg-blue-50",   iconColor: "text-blue-500" },
  { title: "Currency Converter", description: "Real-time exchange rates",                  icon: DollarSign, href: "/app/currency",  iconBg: "bg-green-50",  iconColor: "text-green-600" },
  { title: "Weather Forecast",   description: "Check weather for your destination",        icon: CloudSun,   href: "/app/weather",   iconBg: "bg-yellow-50", iconColor: "text-yellow-600" },
  { title: "Translator",         description: "Translate text and voice",                  icon: Languages,  href: "/app/translate", iconBg: "bg-purple-50", iconColor: "text-purple-500" },
  { title: "Offline Maps",       description: "Download maps for offline use",             icon: Map,        href: "/app/maps",      iconBg: "bg-orange-50", iconColor: "text-orange-500" },
  { title: "Emergency Info",     description: "Local emergency numbers",                   icon: Siren,      href: "/app/emergency", iconBg: "bg-red-50",    iconColor: "text-red-500" },
];

export default function Tools() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#111827] tracking-tight">Travel Tools</h1>
        <p className="text-[#6a6a6a] mt-1">Utilities to help you during your journey</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {TOOLS.map((tool) => (
          <Link key={tool.title} href={tool.href}>
            <div className="bg-white rounded-3xl border border-[#ebebeb] p-6 hover:border-[#F59E0B]/30 hover:shadow-md transition-all cursor-pointer group flex flex-col h-full">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${tool.iconBg} group-hover:scale-110 transition-transform`}>
                <tool.icon className={`w-6 h-6 ${tool.iconColor}`} />
              </div>
              <h3 className="text-base font-semibold text-[#111827] mb-1">{tool.title}</h3>
              <p className="text-[#6a6a6a] text-sm flex-1">{tool.description}</p>
              <div className="flex items-center text-[#F59E0B] text-sm font-medium mt-4 opacity-0 group-hover:opacity-100 translate-x-[-6px] group-hover:translate-x-0 transition-all duration-200">
                Open Tool <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
