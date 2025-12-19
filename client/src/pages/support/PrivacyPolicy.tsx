import React from "react";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
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
                <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
                <p className="text-ios-gray mb-4">Last updated: December 2025</p>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">1. Introduction</h2>
                    <p className="text-gray-300">
                        Welcome to TripMate. We respect your privacy and are committed to protecting your personal data.
                        This privacy policy will inform you as to how we look after your personal data when you visit our website
                        and tell you about your privacy rights and how the law protects you.
                    </p>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">2. Data We Collect</h2>
                    <p className="text-gray-300">
                        We may collect, use, store and transfer different kinds of personal data about you which we have grouped together follows:
                    </p>
                    <ul className="list-disc pl-6 text-gray-300 space-y-2">
                        <li><strong>Identity Data:</strong> First name, last name, username.</li>
                        <li><strong>Contact Data:</strong> Email address, telephone number.</li>
                        <li><strong>Technical Data:</strong> Internet protocol (IP) address, browser type and version, time zone setting and location.</li>
                        <li><strong>Usage Data:</strong> Information about how you use our website, products and services.</li>
                    </ul>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">3. How We Use Your Data</h2>
                    <p className="text-gray-300">
                        We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:
                    </p>
                    <ul className="list-disc pl-6 text-gray-300 space-y-2">
                        <li>To provide the travel planning services you request.</li>
                        <li>To manage your account and relationship with us.</li>
                        <li>To improve our website, products/services, marketing or customer relationships.</li>
                        <li>To personalize your experience and deliver relevant content.</li>
                    </ul>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">4. Data Security</h2>
                    <p className="text-gray-300">
                        We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used, or accessed in an unauthorized way. In addition, we limit access to your personal data to those employees, agents, contractors, and other third parties who have a business need to know.
                    </p>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">5. Third-Party Links</h2>
                    <p className="text-gray-300">
                        This website may include links to third-party websites, plug-ins, and applications. Clicking on those links or enabling those connections may allow third parties to collect or share data about you. We do not control these third-party websites and are not responsible for their privacy statements.
                    </p>
                </section>

                <section className="space-y-4 mb-8">
                    <h2 className="text-2xl font-semibold text-white">6. Contact Us</h2>
                    <p className="text-gray-300">
                        If you have any questions about this privacy policy or our privacy practices, please contact us via our feedback form.
                    </p>
                </section>
            </div>
        </div>
    );
}
