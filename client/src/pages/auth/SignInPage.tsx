import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocation, Link } from "wouter";
import { motion, useScroll, useTransform } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SignInSchema = z.object({ email: z.string().email(), password: z.string().min(6) });

export default function SignInPage() {
  const { toast } = useToast();
  const { scrollYProgress } = useScroll();
  const bgY = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, isAuthenticated, setAuthTokenFromOAuth, logout } = useAuth();
  const [location, navigate] = useLocation();
  const { data: providers } = useQuery({
    queryKey: ["/api/v1/auth/providers"],
    queryFn: async () => {
      const res = await fetch("/api/v1/auth/providers");
      if (!res.ok) return { google: false, apple: false } as any;
      return res.json();
    }
  });

  // Check for token in URL params (OAuth callback)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    if (token) {
      // Update global auth state so protected routes work immediately
      setAuthTokenFromOAuth(token);
      // Clean up the URL to remove the token
      window.history.replaceState({}, document.title, "/signin");
      navigate("/app/home");
    }
  }, [navigate, setAuthTokenFromOAuth]);

  // Redirect if already authenticated
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
        const editable = (el as HTMLElement).isContentEditable;
        return tag === 'input' || tag === 'textarea' || editable;
      };
      if (e.key === 'Backspace' && !isTextInput(document.activeElement)) {
        setEmail("");
        setPassword("");
        setError("");
        setIsLoading(false);
        setRemember(false);
        logout?.();
        navigate("/");
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [logout, navigate]);

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
      await login(email, password, remember);
      // Wait a bit for the authentication state to update
      setTimeout(() => {
        navigate("/app/home");
      }, 100);
    } catch (err: any) {
      console.error("Sign in error:", err);
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      // Determine if it's a "Google account" error to suggest Google Sign-In
      if (msg.includes("Google Sign-In")) {
        toast({
          title: "Use Google Sign-In",
          description: msg,
          variant: "default", // or subtle info variant
        });
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/guest', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.token) {
        setAuthTokenFromOAuth(data.token);
        // Small delay for state
        setTimeout(() => navigate("/app/home"), 100);
      } else {
        throw new Error(data.message || "Guest login failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to continue as guest");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <motion.div
        className="w-full"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">TripMate</h1>
          <p className="text-ios-gray">Sign in to continue your journey</p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <Card className="bg-ios-card border-ios-gray">
            <CardHeader>
              <CardTitle className="text-white">Sign In</CardTitle>
              <CardDescription>Enter your credentials to access your account</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                  viewport={{ once: true }}
                >
                  <Label htmlFor="email" className="text-white">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                  />
                </motion.div>

                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  viewport={{ once: true }}
                >
                  <Label htmlFor="password" className="text-white">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-ios-gray hover:text-white"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </motion.div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Alert className="bg-red-900/20 border-red-500">
                      <AlertDescription className="text-red-400">{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={remember}
                      onCheckedChange={(checked) => setRemember(checked as boolean)}
                      className="border-ios-gray data-[state=checked]:bg-ios-blue data-[state=checked]:border-ios-blue"
                    />
                    <Label htmlFor="remember" className="text-white cursor-pointer">Keep me signed in</Label>
                  </div>
                  <Link href="/forgot-password">
                    <a className="text-sm font-medium text-ios-blue hover:text-blue-400">
                      Forgot password?
                    </a>
                  </Link>
                </div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                  <motion.button
                    type="submit"
                    className="w-full bg-gradient-to-r from-ios-blue to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-md px-4 py-2"
                    disabled={isLoading}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLoading ? "Signing In..." : "Sign In"}
                  </motion.button>
                </motion.div>
              </form>

              <motion.div className="mt-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} viewport={{ once: true }}>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-ios-gray" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-ios-card px-2 text-ios-gray">Or continue with</span>
                  </div>
                </div>

                <div className="mt-4">
                  <motion.button
                    onClick={() => {
                      if (providers?.google) {
                        window.location.href = "/api/v1/auth/google";
                      } else {
                        setError("Google sign-in is not configured");
                      }
                    }}
                    className="w-full bg-ios-card hover:bg-ios-card text-white border border-ios-gray rounded-md px-4 py-2 smooth-transition interactive-tap min-tap-target flex items-center justify-center"
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    {providers?.google ? "Sign in with Google" : "Google not available"}
                  </motion.button>
                </div>

                <div className="mt-4">
                  <motion.button
                    onClick={handleGuestLogin}
                    className="w-full bg-ios-dark border border-ios-gray text-white rounded-md px-4 py-2 hover:bg-ios-card smooth-transition interactive-tap flex items-center justify-center font-medium"
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isLoading}
                  >
                    Continue as Guest
                  </motion.button>
                </div>
              </motion.div>

              <motion.div className="mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} viewport={{ once: true }}>
                <p className="text-ios-gray text-sm">
                  Don't have an account?{" "}
                  <button
                    onClick={() => navigate("/signup")}
                    className="text-ios-blue hover:text-blue-400 underline"
                  >
                    Sign up
                  </button>
                </p>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div >
  );
}
