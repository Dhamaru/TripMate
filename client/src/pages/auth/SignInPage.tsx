import { useState, useEffect } from "react";
import { useAuthStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SignInSchema = z.object({ 
  email: z.string().email(), 
  password: z.string().min(6) 
});

export default function SignInPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, isAuthenticated, signOut, guestSignIn } = useAuthStore();
  const [, navigate] = useLocation();
  
  const { data: providers } = useQuery({
    queryKey: ["/api/v1/auth/providers"],
    queryFn: async () => {
      const res = await fetch("/api/v1/auth/providers");
      if (!res.ok) return { google: false } as any;
      return res.json();
    }
  });

  // Google OAuth redirects to /app/home with cookie set — no URL token param needed
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err === "google_not_configured") setError("Google Sign-In is not configured on the server.");
    else if (err === "auth_failed") setError("Google authentication failed. Please try again.");
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/app/home");
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isTextInput = (el: Element | null) => {
        if (!el) return false;
        const tag = (el as HTMLElement).tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
      };
      if (e.key === 'Backspace' && !isTextInput(document.activeElement)) {
        setEmail("");
        setPassword("");
        setError("");
        setIsLoading(false);
        signOut?.();
        navigate("/");
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [signOut, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const parsed = SignInSchema.safeParse({ email, password });
      if (!parsed.success) {
        setError("Please enter a valid email and a password of 6+ characters.");
        return;
      }
      await signIn(email, password);
      setTimeout(() => navigate("/app/home"), 100);
    } catch (err: any) {
      console.error("Sign in error:", err);
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      if (msg.includes("Google Sign-In")) {
        toast({ title: "Use Google Sign-In", description: msg });
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    try {
      await guestSignIn();
      setTimeout(() => navigate("/app/home"), 100);
    } catch (err: any) {
      setError(err.message || "Failed to continue as guest");
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-white/10 backdrop-blur-xl border-white/15 radius-card p-1 shadow-2xl overflow-hidden">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center mt-2 mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Sign In</h2>
          <p className="text-white/60 font-medium">Enter your credentials to access your trips</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-white ml-1">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 focus:border-[#B3261E] transition-colors font-medium"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between ml-1">
              <Label htmlFor="password" className="text-sm font-medium text-white">Password</Label>
              <Link href="/forgot-password" className="text-xs font-semibold text-[#B3261E] hover:text-amber-300 smooth-transition">
                Forgot Password?
              </Link>
            </div>
            <div className="relative group">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 focus:border-[#B3261E] transition-colors font-medium"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 hover:bg-transparent text-white/60"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <Alert className="bg-red-900/10 border-red-500/50 py-3 rounded-xl">
                <AlertDescription className="text-red-400 text-sm font-medium">{error}</AlertDescription>
              </Alert>
            </motion.div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 bg-[#B3261E] hover:bg-[#8C1D17] active:scale-[0.98] transition-all rounded-xl font-bold text-lg shadow-lg shadow-amber-500/30"
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </Button>

          {providers?.google !== false && (
            <a href="/api/v1/auth/google" className="block">
              <Button
                type="button"
                variant="outline"
                className="w-full h-14 border-white/20 rounded-xl hover:bg-white/10 transition-all font-bold text-lg text-white flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>
            </a>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleGuestLogin}
            disabled={isLoading}
            className="w-full h-14 border-white/20 rounded-xl hover:bg-white/10 smooth-transition font-bold text-lg text-white"
          >
            Continue as Guest
          </Button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
            <span className="bg-transparent px-3 text-white/40">New to TripMate?</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="h-14 border-white/20 rounded-xl hover:bg-white/10 smooth-transition w-full font-bold text-lg text-white"
          onClick={() => navigate("/signup")}
        >
          Create Account
        </Button>
      </CardContent>
    </Card>
  );
}
