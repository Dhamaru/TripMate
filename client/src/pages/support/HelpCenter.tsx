import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Link } from "wouter";
import { Layout, MessageCircle, FileText, Globe } from "lucide-react";

export default function HelpCenter() {
    return (
        <div className="min-h-screen bg-ios-darker text-white">
            {/* Header */}
            <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <Link href="/">
                            <div className="cursor-pointer">
                                <TripMateLogo size="md" />
                            </div>
                        </Link>
                        <div className="flex items-center space-x-4">
                            <Link href="/">
                                <Button variant="ghost" className="text-ios-gray hover:text-white">
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
                            className="pl-10 bg-ios-card border-ios-gray text-white h-12 rounded-xl"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <Card className="bg-ios-card border-ios-gray hover:border-ios-blue transition-colors cursor-pointer group">
                        <CardContent className="p-6 text-center">
                            <div className="w-12 h-12 bg-ios-blue/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-ios-blue/20 transition-colors">
                                <Layout className="text-ios-blue w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2 text-white">Getting Started</h3>
                            <p className="text-ios-gray text-sm">Account setup, trip planning basics, and navigating the app.</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-ios-card border-ios-gray hover:border-ios-green transition-colors cursor-pointer group">
                        <CardContent className="p-6 text-center">
                            <div className="w-12 h-12 bg-ios-green/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-ios-green/20 transition-colors">
                                <Globe className="text-ios-green w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2 text-white">Offline Maps</h3>
                            <p className="text-ios-gray text-sm">Downloading maps, saving regions, and navigation help.</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-ios-card border-ios-gray hover:border-ios-orange transition-colors cursor-pointer group">
                        <CardContent className="p-6 text-center">
                            <div className="w-12 h-12 bg-ios-orange/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-ios-orange/20 transition-colors">
                                <FileText className="text-ios-orange w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2 text-white">Billing & Plans</h3>
                            <p className="text-ios-gray text-sm">Subscription management, payment methods, and refunds.</p>
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
                        <Card key={i} className="bg-ios-card border-ios-gray">
                            <CardHeader>
                                <CardTitle className="text-lg text-white">{faq.q}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-ios-gray">{faq.a}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
