import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link } from "wouter";
import { Lock, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const resetPasswordSchema = z.object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
    const { toast } = useToast();
    const [, navigate] = useLocation();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Get token from URL query params
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    const form = useForm<ResetPasswordForm>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: {
            password: "",
            confirmPassword: "",
        },
    });

    async function onSubmit(data: ResetPasswordForm) {
        if (!token) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Invalid or missing reset token.",
            });
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch("/api/v1/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token,
                    password: data.password,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to reset password");
            }

            toast({
                title: "Success",
                description: "Your password has been reset. Please sign in.",
            });
            navigate("/signin");
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

    if (!token) {
        return (
            <Card className="bg-white/10 backdrop-blur-xl border-white/15 radius-card p-1 shadow-2xl overflow-hidden">
                <CardContent className="p-8 text-center pt-12 pb-12">
                    <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Lock className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Invalid Token</h2>
                    <p className="text-white/60 font-medium mb-8">
                        The reset link is invalid or has expired.
                    </p>
                    <Button 
                        onClick={() => navigate("/signin")} 
                        variant="outline" 
                        className="w-full h-14 border-white/20 rounded-xl text-white hover:bg-white/10 font-bold"
                    >
                        Back to Sign In
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-white/10 backdrop-blur-xl border-white/15 radius-card p-1 shadow-2xl overflow-hidden">
            <CardContent className="p-8">
                <div className="flex flex-col items-center text-center mt-2 mb-8">
                    <div className="w-16 h-16 bg-[#B3261E]/20 rounded-2xl flex items-center justify-center mb-6">
                        <Lock className="w-8 h-8 text-[#B3261E]" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-2">Reset Password</h2>
                    <p className="text-white/60 font-medium">
                        Create a strong new password for your account
                    </p>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <FormLabel className="text-sm font-medium text-white ml-1">New Password</FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 pr-12 focus:border-[#1D4E89] smooth-transition"
                                                {...field}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 hover:bg-transparent text-white/60 hover:text-white"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-5 w-5" />
                                                ) : (
                                                    <Eye className="h-5 w-5" />
                                                )}
                                            </Button>
                                        </div>
                                    </FormControl>
                                    <FormMessage className="text-red-400 font-medium ml-1" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <FormLabel className="text-sm font-medium text-white ml-1">Confirm Password</FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input
                                                type={showConfirmPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 pr-12 focus:border-[#1D4E89] smooth-transition"
                                                {...field}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 hover:bg-transparent text-white/60 hover:text-white"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            >
                                                {showConfirmPassword ? (
                                                    <EyeOff className="h-5 w-5" />
                                                ) : (
                                                    <Eye className="h-5 w-5" />
                                                )}
                                            </Button>
                                        </div>
                                    </FormControl>
                                    <FormMessage className="text-red-400 font-medium ml-1" />
                                </FormItem>
                            )}
                        />
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-14 bg-[#B3261E] hover:bg-[#8C1D17] active:scale-[0.98] transition-all rounded-xl font-bold text-lg shadow-lg shadow-amber-500/30"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Resetting...
                                </>
                            ) : (
                                "Update Password"
                            )}
                        </Button>
                    </form>
                </Form>

                <div className="mt-8 text-center">
                    <Link href="/signin">
                        <Button variant="ghost" size="sm" className="text-white/60 hover:text-white hover:bg-transparent font-semibold">
                            Back to Sign In
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
