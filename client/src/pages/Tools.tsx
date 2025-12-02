import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
    CloudSun,
    DollarSign,
    Languages,
    Siren,
    ListChecks,
    Map,
    ArrowRight
} from "lucide-react";

const TOOLS = [
    {
        title: "Packing List",
        description: "Smart checklists for your trips",
        icon: ListChecks,
        href: "/app/packing",
        color: "text-blue-500",
        bg: "bg-blue-500/10",
    },
    {
        title: "Currency Converter",
        description: "Real-time exchange rates",
        icon: DollarSign,
        href: "/app/currency",
        color: "text-green-500",
        bg: "bg-green-500/10",
    },
    {
        title: "Weather Forecast",
        description: "Check weather for your destination",
        icon: CloudSun,
        href: "/app/weather",
        color: "text-yellow-500",
        bg: "bg-yellow-500/10",
    },
    {
        title: "Translator",
        description: "Translate text and voice",
        icon: Languages,
        href: "/app/translate",
        color: "text-purple-500",
        bg: "bg-purple-500/10",
    },
    {
        title: "Offline Maps",
        description: "Download maps for offline use",
        icon: Map,
        href: "/app/maps",
        color: "text-orange-500",
        bg: "bg-orange-500/10",
    },
    {
        title: "Emergency Info",
        description: "Local emergency numbers",
        icon: Siren,
        href: "/app/emergency",
        color: "text-red-500",
        bg: "bg-red-500/10",
    },
];

export default function Tools() {
    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Travel Tools</h1>
                <p className="text-muted-foreground">Utilities to help you during your journey</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {TOOLS.map((tool) => (
                    <Link key={tool.title} href={tool.href}>
                        <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer group h-full">
                            <CardContent className="p-6 flex flex-col h-full">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${tool.bg}`}>
                                    <tool.icon className={`w-6 h-6 ${tool.color}`} />
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-primary transition-colors">
                                    {tool.title}
                                </h3>
                                <p className="text-muted-foreground text-sm mb-4 flex-1">
                                    {tool.description}
                                </p>
                                <div className="flex items-center text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0 duration-300">
                                    Open Tool <ArrowRight className="w-4 h-4 ml-1" />
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
