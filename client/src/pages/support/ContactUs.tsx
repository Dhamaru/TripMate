import React, { useState } from "react";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ContactUs() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const [sending, setSending] = useState(false);

  // Goes to the same inbox as in-app feedback, which also emails the sender
  // a confirmation. This form used to say "sent" and discard the message.
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = `${data.get("firstName")} ${data.get("lastName")}`.trim();
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/v1/feedback", {
        type: "feedback",
        category: "contact",
        subject: `Contact form message from ${name}`,
        description: String(data.get("message")),
        email: String(data.get("email")),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      setSubmitted(true);
      toast({
        title: "Message Sent",
        description: "We'll get back to you as soon as possible.",
      });
    } catch {
      toast({
        title: "Message not sent",
        description: "Something went wrong. Please try again in a few minutes.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted text-foreground">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-muted/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <div className="cursor-pointer">
                <TripMateLogo size="md" />
              </div>
            </Link>
            <Link href="/">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-20 max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">Get in Touch</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Have questions about TripMate? We're here to help. Send us a message and we'll reply by
            email.
          </p>
        </div>

        <div className="max-w-xl mx-auto">
          <div className="bg-card border border-border rounded-xl p-8">
            <h2 className="text-2xl font-bold text-foreground mb-6">Send a Message</h2>
            {submitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-check text-green-500 text-2xl"></i>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Message Sent!</h3>
                <p className="text-muted-foreground">
                  Thank you for contacting us. We will get back to you shortly.
                </p>
                <Button
                  onClick={() => setSubmitted(false)}
                  variant="outline"
                  className="mt-6 border-border text-foreground hover:bg-muted"
                >
                  Send Another
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="firstName" className="text-sm font-medium text-foreground">
                      First Name
                    </label>
                    <Input
                      id="firstName"
                      name="firstName"
                      data-testid="contact-firstName"
                      autoComplete="given-name"
                      placeholder="John"
                      className="bg-muted border-border text-foreground"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="lastName" className="text-sm font-medium text-foreground">
                      Last Name
                    </label>
                    <Input
                      id="lastName"
                      name="lastName"
                      data-testid="contact-lastName"
                      autoComplete="family-name"
                      placeholder="Doe"
                      className="bg-muted border-border text-foreground"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email
                  </label>
                  <Input
                    id="email"
                    name="email"
                    data-testid="contact-email"
                    autoComplete="email"
                    type="email"
                    placeholder="john@example.com"
                    className="bg-muted border-border text-foreground"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-medium text-foreground">
                    Message
                  </label>
                  <Textarea
                    id="message"
                    name="message"
                    data-testid="contact-message"
                    placeholder="How can we help you?"
                    className="bg-muted border-border text-foreground min-h-[150px]"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  data-testid="contact-submit"
                  disabled={sending}
                  className="w-full bg-[#1D4E89] hover:bg-[#163F73]"
                >
                  {sending ? "Sending..." : "Send Message"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
