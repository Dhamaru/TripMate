import { useState, useEffect } from "react";
import { useAuthStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [remember, setRemember] = useState(false);
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
        setRemember(false);
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
              className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 focus:border-[#F59E0B] transition-colors font-medium"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between ml-1">
              <Label htmlFor="password" className="text-sm font-medium text-white">Password</Label>
              <Link href="/forgot-password" className="text-xs font-semibold text-[#F59E0B] hover:text-amber-300 smooth-transition">
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
                className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 focus:border-[#F59E0B] transition-colors font-medium"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 hover:bg-transparent text-black"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center space-x-2 ml-1">
            <Checkbox 
              id="remember" 
              checked={remember} 
              onCheckedChange={(checked) => setRemember(checked as boolean)}
              className="border-white/20 data-[state=checked]:bg-[#F59E0B] data-[state=checked]:border-[#F59E0B]"
            />
            <label
              htmlFor="remember"
              className="text-xs font-medium text-white/60 cursor-pointer"
            >
              Remember me on this device
            </label>
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
            className="w-full h-14 bg-[#F59E0B] hover:bg-[#D97706] active:scale-[0.98] transition-all rounded-xl font-bold text-lg shadow-lg shadow-amber-500/30"
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </Button>

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
