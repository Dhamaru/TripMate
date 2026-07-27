import { useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuthStore } from "@/store";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

const SignUpSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email(),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { signUp } = useAuthStore();
  const [, navigate] = useLocation();

  const { data: providers } = useQuery({
    queryKey: ["/api/v1/auth/providers"],
    queryFn: async () => {
      const res = await fetch("/api/v1/auth/providers");
      if (!res.ok) return { google: false } as any;
      return res.json();
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsed = SignUpSchema.safeParse(formData);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setError(firstIssue?.message || "Please enter valid details: name (1+), email, password (6+).");
      return;
    }

    setIsLoading(true);

    try {
      await signUp(formData.email, formData.password, formData.firstName, formData.lastName);
      navigate("/signin");
    } catch (err: any) {
      setError(err.message || "Sign up failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-white/10 backdrop-blur-xl border-white/15 radius-card p-1 shadow-2xl overflow-hidden">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center mt-2 mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Sign Up</h2>
          <p className="text-white/60 font-medium">Create your personalized travel account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium text-white ml-1">First Name</Label>
              <Input
                id="firstName"
                name="firstName"
                type="text"
                placeholder="Jane"
                value={formData.firstName}
                onChange={handleChange}
                required
                className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 focus:border-[#B3261E] transition-colors font-medium"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium text-white ml-1">Last Name</Label>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                placeholder="Smith"
                value={formData.lastName}
                onChange={handleChange}
                required
                className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 focus:border-[#B3261E] transition-colors font-medium"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-white ml-1">Email Address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="Enter your email address"
              value={formData.email}
              onChange={handleChange}
              required
              className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 focus:border-[#B3261E] transition-colors font-medium"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center">
              <Label htmlFor="password" className="text-sm font-medium text-white ml-1">Password</Label>
            </div>
            <div className="relative group">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={formData.password}
                onChange={handleChange}
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

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium text-white ml-1">Confirm Password</Label>
            <div className="relative group">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Repeat your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className="bg-white/10 border-white/20 h-14 rounded-xl text-white placeholder:text-white/40 focus:border-[#B3261E] transition-colors font-medium"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 hover:bg-transparent text-white/60"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-4">
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
            {isLoading ? "Creating Account..." : "Create Account"}
          </Button>

          {providers?.google !== false && (
            <a href="/api/v1/auth/google" className="block">
              <Button type="button" variant="outline" className="w-full h-14 border-white/20 rounded-xl hover:bg-white/10 transition-all font-bold text-lg text-white flex items-center justify-center gap-3">
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign up with Google
              </Button>
            </a>
          )}
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
            <span className="bg-transparent px-3 text-white/40">Already have an account?</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="h-14 border-white/20 rounded-xl hover:bg-white/10 smooth-transition w-full font-bold text-lg text-white"
          onClick={() => navigate("/signin")}
        >
          Sign In Instead
        </Button>

        <p className="mt-8 text-center text-[10px] text-white/60 font-medium uppercase tracking-widest px-8">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </CardContent>
    </Card>
  );
}
