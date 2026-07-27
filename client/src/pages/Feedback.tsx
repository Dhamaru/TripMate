import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import { Lightbulb, Bug, Sparkles, FileText } from 'lucide-react';

export default function Feedback() {
    const { user } = useAuth() as any;
    const [form, setForm] = useState({
        type: 'feedback',
        category: '',
        subject: '',
        description: '',
        email: user?.email || '',
    });
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await apiRequest('POST', '/api/v1/feedback', form);

            if (response.ok) {
                toast({
                    title: 'Thank you!',
                    description: 'Your feedback has been submitted successfully.'
                });
                setForm({
                    type: 'feedback',
                    category: '',
                    subject: '',
                    description: '',
                    email: user?.email || '',
                });
            } else {
                throw new Error('Failed to submit');
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to submit feedback. Please try again.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className=" p-6">
            <div>
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Feedback & Support</h1>
                    <p className="text-muted-foreground">
                        Help us improve TripMate by sharing your feedback or reporting issues
                    </p>
                </div>

                <Card className="bg-card border">
                    <CardHeader>
                        <CardTitle className="text-foreground">Submit Feedback or Report Issue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Type Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-foreground mb-2">
                                    Type <span className="text-red-500">*</span>
                                </label>
                                <Select
                                    value={form.type}
                                    onValueChange={(value) => setForm({ ...form, type: value })}
                                >
                                    <SelectTrigger className="bg-muted/50 border text-foreground">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border">
                                        <SelectItem value="feedback" className="text-foreground hover:bg-muted cursor-pointer">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                                    <Lightbulb className="w-4 h-4 text-[#1D4E89]" />
                                                </div>
                                                Feedback / Suggestion
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="bug" className="text-foreground hover:bg-muted cursor-pointer">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                                                    <Bug className="w-4 h-4 text-red-500" />
                                                </div>
                                                Bug Report
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="feature" className="text-foreground hover:bg-muted cursor-pointer">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                                </div>
                                                Feature Request
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="other" className="text-foreground hover:bg-muted cursor-pointer">
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
                                    Category <span className="text-red-500">*</span>
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
                                    Email <span className="text-red-500">*</span>
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
                                    Subject <span className="text-red-500">*</span>
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
                                    Description <span className="text-red-500">*</span>
                                </label>
                                <Textarea
                                    placeholder={
                                        form.type === 'bug'
                                            ? 'Please describe the issue:\n\n1. What were you trying to do?\n2. What happened instead?\n3. Steps to reproduce (if applicable)'
                                            : 'Please provide detailed information about your feedback or suggestion'
                                    }
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground min-h-[200px]"
                                    required
                                />
                            </div>

                            {/* Submit Button */}
                            <Button
                                type="submit"
                                disabled={loading || !form.category || !form.subject || !form.description}
                                className="w-full bg-[#1D4E89] hover:bg-blue-600 text-white py-3 text-lg font-semibold "
                            >
                                {loading ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin mr-2"></i>
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-paper-plane mr-2"></i>
                                        Submit {form.type === 'bug' ? 'Bug Report' : 'Feedback'}
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
                                <i className="fas fa-clock text-[#1D4E89] text-xl mt-1"></i>
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
                                <i className="fas fa-shield-alt text-emerald-500 text-xl mt-1"></i>
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
