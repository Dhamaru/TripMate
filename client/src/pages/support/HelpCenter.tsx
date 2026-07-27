import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Link } from "wouter";
import { Layout, MessageCircle, FileText, Globe } from "lucide-react";

export default function HelpCenter() {
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
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <i className="fas fa-search text-gray-400"></i>
                        </div>
                        <Input
                            placeholder="Search for answers..."
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    // Placeholder for search logic if added later
                                }
                            }}
                            className="pl-10 bg-card border-border text-foreground h-12 rounded-xl"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <Card className="bg-card border-border hover:border-[#1D4E89] transition-colors cursor-pointer group">
                        <CardContent className="p-6 text-center">
                            <div className="w-12 h-12 bg-[#1D4E89]/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-[#1D4E89]/20 transition-colors">
                                <Layout className="text-[#1D4E89] dark:text-blue-400 w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2 text-foreground">Getting Started</h3>
                            <p className="text-muted-foreground text-sm">Account setup, trip planning basics, and navigating the app.</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-card border-border hover:border-emerald-600 transition-colors cursor-pointer group">
                        <CardContent className="p-6 text-center">
                            <div className="w-12 h-12 bg-emerald-600/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-emerald-600/20 transition-colors">
                                <Globe className="text-emerald-600 dark:text-emerald-400 w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2 text-foreground">Offline Maps</h3>
                            <p className="text-muted-foreground text-sm">Downloading maps, saving regions, and navigation help.</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-card border-border hover:border-[#B3261E] transition-colors cursor-pointer group">
                        <CardContent className="p-6 text-center">
                            <div className="w-12 h-12 bg-[#B3261E]/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-[#B3261E]/20 transition-colors">
                                <FileText className="text-[#B3261E] w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2 text-foreground">Billing & Plans</h3>
                            <p className="text-muted-foreground text-sm">Subscription management, payment methods, and refunds.</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>

                    {[
                        { q: "How do I create a new trip?", a: "Go to the Dashboard and click 'Plan New Trip'. Enter your destination and preferences, and our AI will generate an itinerary for you." },
                        { q: "Can I use TripMate offline?", a: "Yes! You can download maps, itineraries, and saved places for offline access. Make sure to download them before you disconnect." },
                        { q: "Is my data secure?", a: "We take security seriously. All your personal data and travel plans are encrypted and stored securely." }
                    ].map((faq, i) => (
                        <Card key={i} className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-lg text-foreground">{faq.q}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">{faq.a}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
