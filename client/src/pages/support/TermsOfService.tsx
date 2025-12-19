import React from "react";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-ios-darker text-white">
            <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <Link href="/">
                            <div className="cursor-pointer">
                                <TripMateLogo size="md" />
                            </div>
                        </Link>
                        <Link href="/">
                            <Button variant="ghost" className="text-ios-gray hover:text-white">Back to Home</Button>
                        </Link>
                    </div>
                </div>
            </nav>

            <div className="pt-24 pb-20 max-w-3xl mx-auto px-4 prose prose-invert">
                <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
                <p className="text-ios-gray mb-4">Last updated: December 2025</p>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">1. Acceptance of Terms</h2>
                    <p className="text-gray-300">
                        By accessing and using TripMate, you accept and agree to be bound by the terms and provision of this agreement.
                    </p>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">2. Use License</h2>
                    <p className="text-gray-300">
                        Permission is granted to temporarily download one copy of the materials (information or software) on TripMate's website for personal, non-commercial transitory viewing only.
                    </p>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">3. Disclaimer</h2>
                    <p className="text-gray-300">
                        The materials on TripMate's website are provided on an 'as is' basis. TripMate makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
                    </p>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">4. Limitations</h2>
                    <p className="text-gray-300">
                        In no event shall TripMate or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on TripMate's website.
                    </p>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">5. Accuracy of Materials</h2>
                    <p className="text-gray-300">
                        The materials appearing on TripMate's website could include technical, typographical, or photographic errors. TripMate does not warrant that any of the materials on its website are accurate, complete or current.
                    </p>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">6. Governing Law</h2>
                    <p className="text-gray-300">
                        These terms and conditions are governed by and construed in accordance with the laws and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
                    </p>
                </section>
            </div>
        </div>
    );
}
