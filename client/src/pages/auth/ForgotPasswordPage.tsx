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
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

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
      // Raw fetch() here previously skipped the CSRF header apiRequest
      // attaches — silently 403'd in production for any visitor who
      // still had a stale auth cookie present (the CSRF check keys off
      // cookie presence, not validity).
      const response = await apiRequest("POST", "/api/v1/auth/forgot-password", data);
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
    <Card className="bg-white/10 backdrop-blur-xl border-white/15 radius-card p-1 shadow-2xl overflow-hidden">
      <CardContent className="p-8">
        <div className="flex items-center mb-6">
          <Link href="/signin">
            <Button
              variant="ghost"
              size="sm"
              className="pl-0 text-white/60 hover:text-white hover:bg-transparent group"
            >
              <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              Back to Sign In
            </Button>
          </Link>
        </div>

        <div className="flex flex-col items-center text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Forgot Password</h2>
          <p className="text-white/60 font-medium">Enter your email to receive a reset link</p>
        </div>

        {isSubmitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6 space-y-6"
          >
            <div className="mx-auto w-16 h-16 bg-[#163F73]/20 rounded-2xl flex items-center justify-center">
              <Mail className="w-8 h-8 text-[#163F73]" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">Check your email</h3>
              <p className="text-white/60 font-medium">
                We've sent a password reset link to <br />
                <span className="text-white font-bold">{form.getValues("email")}</span>
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full h-14 border-white/20 rounded-xl text-white hover:bg-white/10 font-bold"
              onClick={() => setIsSubmitted(false)}
            >
              Try another email
            </Button>
          </motion.div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-medium text-white ml-1">
                      Email Address
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/60" />
                        <Input
                          placeholder="your@email.com"
                          autoFocus
                          className="pl-12 bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 focus:border-[#163F73] smooth-transition"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400 font-medium ml-1" />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-[#163F73] hover:bg-[#0F2C52] active:scale-[0.98] transition-all rounded-xl font-bold text-lg shadow-lg shadow-[#163F73]/30"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
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
  );
}
