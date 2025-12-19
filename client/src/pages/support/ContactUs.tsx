import React, { useState } from "react";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Phone, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ContactUs() {
    const { toast } = useToast();
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
        toast({
            title: "Message Sent",
            description: "We'll get back to you as soon as possible.",
        });
    };

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

            <div className="pt-24 pb-20 max-w-6xl mx-auto px-4">
                <div className="text-center mb-16">
                    <h1 className="text-4xl font-bold mb-4">Get in Touch</h1>
                    <p className="text-ios-gray max-w-2xl mx-auto">
                        Have questions about TripMate? We're here to help. Send us a message and we'll respond within 24 hours.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Contact Info */}
                    <div className="space-y-8">
                        <Card className="bg-ios-card border-ios-gray">
                            <CardContent className="p-6 flex items-start space-x-4">
                                <div className="w-12 h-12 bg-ios-blue/10 rounded-full flex items-center justify-center shrink-0">
                                    <Mail className="text-ios-blue w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-1">Email Us</h3>
                                    <p className="text-ios-gray text-sm mb-2">For general inquiries and support</p>
                                    <a href="mailto:support@tripmate.com" className="text-ios-blue hover:underline">support@tripmate.com</a>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-ios-card border-ios-gray">
                            <CardContent className="p-6 flex items-start space-x-4">
                                <div className="w-12 h-12 bg-ios-green/10 rounded-full flex items-center justify-center shrink-0">
                                    <Phone className="text-ios-green w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-1">Call Us</h3>
                                    <p className="text-ios-gray text-sm mb-2">Mon-Fri from 8am to 5pm</p>
                                    <a href="tel:+1234567890" className="text-ios-green hover:underline">+1 (234) 567-890</a>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-ios-card border-ios-gray">
                            <CardContent className="p-6 flex items-start space-x-4">
                                <div className="w-12 h-12 bg-ios-orange/10 rounded-full flex items-center justify-center shrink-0">
                                    <MapPin className="text-ios-orange w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-1">Visit Us</h3>
                                    <p className="text-ios-gray text-sm">
                                        123 Innovation Drive<br />
                                        Tech Valley, CA 94043
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Contact Form */}
                    <div className="bg-ios-card border border-ios-gray rounded-xl p-8">
                        <h2 className="text-2xl font-bold text-white mb-6">Send a Message</h2>
                        {submitted ? (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <i className="fas fa-check text-green-500 text-2xl"></i>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Message Sent!</h3>
                                <p className="text-gray-400">Thank you for contacting us. We will get back to you shortly.</p>
                                <Button onClick={() => setSubmitted(false)} variant="outline" className="mt-6 border-gray-600 text-white hover:bg-gray-800">
                                    Send Another
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-300">First Name</label>
                                        <Input placeholder="John" className="bg-ios-darker border-ios-gray text-white" required />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-300">Last Name</label>
                                        <Input placeholder="Doe" className="bg-ios-darker border-ios-gray text-white" required />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">Email</label>
                                    <Input type="email" placeholder="john@example.com" className="bg-ios-darker border-ios-gray text-white" required />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">Message</label>
                                    <Textarea placeholder="How can we help you?" className="bg-ios-darker border-ios-gray text-white min-h-[150px]" required />
                                </div>

                                <Button type="submit" className="w-full bg-ios-blue hover:bg-blue-600">
                                    Send Message
                                </Button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
