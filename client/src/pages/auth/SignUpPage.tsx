import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuthStore } from "@/store";
import { useLocation, Link } from "wouter";
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
    <Card className="bg-ios-card/50 backdrop-blur-xl border-ios-gray/30 radius-card p-1 shadow-2xl overflow-hidden">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center mt-2 mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Sign Up</h2>
          <p className="text-ios-gray font-medium">Create your personalized travel account</p>
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
                className="bg-card border-ios-gray/30 h-14 rounded-xl text-black placeholder:text-black/40 focus:border-ios-blue smooth-transition font-medium"
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
                className="bg-card border-ios-gray/30 h-14 rounded-xl text-black placeholder:text-black/40 focus:border-ios-blue smooth-transition font-medium"
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
              className="bg-card border-ios-gray/30 h-14 rounded-xl text-black placeholder:text-black/40 focus:border-ios-blue smooth-transition font-medium"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="password" className="text-sm font-medium text-white ml-1">Password</Label>
              <Link href="/forgot-password" className="text-xs font-semibold text-ios-blue hover:text-blue-400 smooth-transition">
                Forgot Password?
              </Link>
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
                className="bg-card border-ios-gray/30 h-14 rounded-xl text-black placeholder:text-black/40 pr-12 focus:border-ios-blue smooth-transition font-medium"
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
                className="bg-card border-ios-gray/30 h-14 rounded-xl text-black placeholder:text-black/40 pr-12 focus:border-ios-blue smooth-transition font-medium"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 hover:bg-transparent text-black"
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
            className="w-full h-14 bg-gradient-to-r from-ios-blue to-purple-600 hover:scale-[1.02] active:scale-[0.98] smooth-transition rounded-xl font-bold text-lg shadow-lg shadow-ios-blue/20 mt-6"
          >
            {isLoading ? "Creating Account..." : "Create Account"}
          </Button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-ios-gray/20"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
            <span className="bg-[#1C1C1E] px-3 text-ios-gray">Already have an account?</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="h-14 border-ios-gray/30 rounded-xl hover:bg-card/5 smooth-transition w-full font-bold text-lg text-white"
          onClick={() => navigate("/signin")}
        >
          Sign In Instead
        </Button>

        <p className="mt-8 text-center text-[10px] text-ios-gray font-medium uppercase tracking-widest px-8">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </CardContent>
    </Card>
  );
}
