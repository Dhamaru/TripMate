import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Lightbulb, Bug, Sparkles, FileText, Paperclip, X } from "lucide-react";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB, matches the server's multer limit

export default function Feedback() {
  const { user } = useAuth() as any;
  const [form, setForm] = useState({
    type: "feedback",
    category: "",
    subject: "",
    description: "",
    email: user?.email || "",
  });
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.currentTarget.value = "";
    if (files.length === 0) return;

    const oversized = files.find((f) => f.size > MAX_ATTACHMENT_SIZE);
    if (oversized) {
      toast({
        title: "File too large",
        description: `"${oversized.name}" is over 5MB.`,
        variant: "destructive",
      });
      return;
    }

    setAttachments((prev) => {
      const combined = [...prev, ...files];
      if (combined.length > MAX_ATTACHMENTS) {
        toast({
          title: "Too many files",
          description: `You can attach up to ${MAX_ATTACHMENTS} screenshots.`,
          variant: "destructive",
        });
        return combined.slice(0, MAX_ATTACHMENTS);
      }
      return combined;
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const missing: string[] = [];
    if (!form.category) missing.push("Category");
    if (!form.subject.trim()) missing.push("Subject");
    if (!form.description.trim()) missing.push("Description");
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
    if (!form.email.trim()) missing.push("Email");
    else if (!emailValid) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    if (missing.length > 0) {
      toast({
        title: "Missing required fields",
        description: `Please fill in: ${missing.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      let response: Response;
      if (attachments.length > 0) {
        const fd = new FormData();
        Object.entries(form).forEach(([key, value]) => fd.append(key, value));
        attachments.forEach((file) => fd.append("attachments", file));
        response = await apiRequest("POST", "/api/v1/feedback", fd);
      } else {
        response = await apiRequest("POST", "/api/v1/feedback", form);
      }

      if (response.ok) {
        toast({
          title: "Thank you!",
          description: "Your feedback has been submitted successfully.",
        });
        setForm({
          type: "feedback",
          category: "",
          subject: "",
          description: "",
          email: user?.email || "",
        });
        setAttachments([]);
      } else {
        throw new Error("Failed to submit");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className=" p-6">
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Feedback & Support
          </h1>
          <p className="text-muted-foreground">
            Help us improve TripMate by sharing your feedback or reporting issues
          </p>
        </div>

        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground">Submit Feedback or Report Issue</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Type <span className="text-destructive">*</span>
                </label>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm({ ...form, type: value })}
                >
                  <SelectTrigger className="bg-muted/50 border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border">
                    <SelectItem
                      value="feedback"
                      className="text-foreground hover:bg-muted cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[rgba(29,78,137,0.1)] flex items-center justify-center">
                          <Lightbulb className="w-4 h-4 text-[var(--explorer-blue)]" />
                        </div>
                        Feedback / Suggestion
                      </div>
                    </SelectItem>
                    <SelectItem
                      value="bug"
                      className="text-foreground hover:bg-muted cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[rgba(179,38,30,0.1)] flex items-center justify-center">
                          <Bug className="w-4 h-4 text-[var(--ios-red)]" />
                        </div>
                        Bug Report
                      </div>
                    </SelectItem>
                    <SelectItem
                      value="feature"
                      className="text-foreground hover:bg-muted cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[rgba(29,78,137,0.1)] flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-[var(--explorer-blue)]" />
                        </div>
                        Feature Request
                      </div>
                    </SelectItem>
                    <SelectItem
                      value="other"
                      className="text-foreground hover:bg-muted cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted/20 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                        </div>
                        Other
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Category <span className="text-destructive">*</span>
                </label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm({ ...form, category: value })}
                >
                  <SelectTrigger className="bg-muted/50 border text-foreground">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border">
                    <SelectItem value="trip-planner" className="text-foreground hover:bg-muted">
                      Trip Planner
                    </SelectItem>
                    <SelectItem value="journal" className="text-foreground hover:bg-muted">
                      Travel Journal
                    </SelectItem>
                    <SelectItem value="packing-list" className="text-foreground hover:bg-muted">
                      Packing List
                    </SelectItem>
                    <SelectItem value="weather" className="text-foreground hover:bg-muted">
                      Weather Tools
                    </SelectItem>
                    <SelectItem value="translator" className="text-foreground hover:bg-muted">
                      Translator
                    </SelectItem>
                    <SelectItem value="maps" className="text-foreground hover:bg-muted">
                      Maps & Navigation
                    </SelectItem>
                    <SelectItem value="profile" className="text-foreground hover:bg-muted">
                      User Profile
                    </SelectItem>
                    <SelectItem value="ui-ux" className="text-foreground hover:bg-muted">
                      UI/UX Design
                    </SelectItem>
                    <SelectItem value="performance" className="text-foreground hover:bg-muted">
                      Performance
                    </SelectItem>
                    <SelectItem value="other" className="text-foreground hover:bg-muted">
                      Other
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Email <span className="text-destructive">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="your.email@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  required
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Subject <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="Brief summary of your feedback or issue"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Description <span className="text-destructive">*</span>
                </label>
                <Textarea
                  placeholder={
                    form.type === "bug"
                      ? "Please describe the issue:\n\n1. What were you trying to do?\n2. What happened instead?\n3. Steps to reproduce (if applicable)"
                      : "Please provide detailed information about your feedback or suggestion"
                  }
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground min-h-[200px]"
                  required
                />
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Screenshots{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional, up to {MAX_ATTACHMENTS})
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFilesSelected}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACHMENTS}
                  className="gap-2"
                >
                  <Paperclip className="w-4 h-4" />
                  Attach Screenshot
                </Button>
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-3 mt-3">
                    {attachments.map((file, i) => (
                      <div
                        key={i}
                        className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group"
                      >
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          aria-label={`Remove ${file.name}`}
                          className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--explorer-blue)] hover:bg-[var(--explorer-blue-deep)] text-white py-3 text-lg font-semibold "
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Submitting...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane mr-2"></i>
                    Submit {form.type === "bug" ? "Bug Report" : "Feedback"}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <i className="fas fa-clock text-[var(--explorer-blue)] text-xl mt-1"></i>
                <div>
                  <h3 className="text-foreground font-semibold mb-1">Response Time</h3>
                  <p className="text-muted-foreground text-sm">
                    We typically respond within 24-48 hours
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <i className="fas fa-shield-alt text-[var(--emerald-horizon)] text-xl mt-1"></i>
                <div>
                  <h3 className="text-foreground font-semibold mb-1">Privacy</h3>
                  <p className="text-muted-foreground text-sm">
                    Your feedback is confidential and secure
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
