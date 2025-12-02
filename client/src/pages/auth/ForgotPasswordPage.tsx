import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const forgotPasswordSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const form = useForm<ForgotPasswordForm>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: {
            email: "",
        },
    });

    async function onSubmit(data: ForgotPasswordForm) {
        setIsLoading(true);
        try {
            const response = await fetch("/api/v1/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to send reset email");
            }

            setIsSubmitted(true);
            toast({
                title: "Email Sent",
                description: "If an account exists with this email, you will receive a reset link.",
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: (error as Error).message,
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-ios-darker p-4">
            <Card className="w-full max-w-md bg-ios-card border-ios-gray">
                <CardHeader className="space-y-1">
                    <div className="flex items-center mb-2">
                        <Link href="/signin">
                            <Button variant="ghost" size="sm" className="pl-0 text-ios-gray hover:text-white">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Sign In
                            </Button>
                        </Link>
                    </div>
                    <CardTitle className="text-2xl font-bold text-white">Forgot Password</CardTitle>
                    <CardDescription className="text-ios-gray">
                        Enter your email address and we'll send you a link to reset your password.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isSubmitted ? (
                        <div className="text-center py-6 space-y-4">
                            <div className="mx-auto w-12 h-12 bg-ios-green/20 rounded-full flex items-center justify-center">
                                <Mail className="w-6 h-6 text-ios-green" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-medium text-white">Check your email</h3>
                                <p className="text-sm text-ios-gray">
                                    We've sent a password reset link to <strong>{form.getValues("email")}</strong>
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                className="w-full border-ios-gray text-white hover:bg-ios-gray/20"
                                onClick={() => setIsSubmitted(false)}
                            >
                                Try another email
                            </Button>
                        </div>
                    ) : (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-white">Email</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-ios-gray" />
                                                    <Input
                                                        placeholder="name@example.com"
                                                        className="pl-9 bg-ios-darker border-ios-gray text-white placeholder:text-ios-gray/50"
                                                        {...field}
                                                    />
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    type="submit"
                                    className="w-full bg-ios-blue hover:bg-blue-600 text-white"
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        "Send Reset Link"
                                    )}
                                </Button>
                            </form>
                        </Form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
