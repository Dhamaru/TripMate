import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';

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
        <div className="min-h-screen bg-ios-darker text-white p-6">
            <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Feedback & Support</h1>
                    <p className="text-ios-gray">
                        Help us improve TripMate by sharing your feedback or reporting issues
                    </p>
                </div>

                <Card className="bg-ios-card border-ios-gray">
                    <CardHeader>
                        <CardTitle className="text-white">Submit Feedback or Report Issue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Type Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-white mb-2">
                                    Type <span className="text-ios-red">*</span>
                                </label>
                                <Select
                                    value={form.type}
                                    onValueChange={(value) => setForm({ ...form, type: value })}
                                >
                                    <SelectTrigger className="bg-ios-darker border-ios-gray text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-ios-darker border-ios-gray">
                                        <SelectItem value="feedback" className="text-white hover:bg-ios-card">
                                            💡 Feedback / Suggestion
                                        </SelectItem>
                                        <SelectItem value="bug" className="text-white hover:bg-ios-card">
                                            🐛 Bug Report
                                        </SelectItem>
                                        <SelectItem value="feature" className="text-white hover:bg-ios-card">
                                            ✨ Feature Request
                                        </SelectItem>
                                        <SelectItem value="other" className="text-white hover:bg-ios-card">
                                            📝 Other
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Category */}
                            <div>
                                <label className="block text-sm font-semibold text-white mb-2">
                                    Category <span className="text-ios-red">*</span>
                                </label>
                                <Select
                                    value={form.category}
                                    onValueChange={(value) => setForm({ ...form, category: value })}
                                >
                                    <SelectTrigger className="bg-ios-darker border-ios-gray text-white">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-ios-darker border-ios-gray">
                                        <SelectItem value="trip-planner" className="text-white hover:bg-ios-card">
                                            Trip Planner
                                        </SelectItem>
                                        <SelectItem value="journal" className="text-white hover:bg-ios-card">
                                            Travel Journal
                                        </SelectItem>
                                        <SelectItem value="packing-list" className="text-white hover:bg-ios-card">
                                            Packing List
                                        </SelectItem>
                                        <SelectItem value="weather" className="text-white hover:bg-ios-card">
                                            Weather Tools
                                        </SelectItem>
                                        <SelectItem value="translator" className="text-white hover:bg-ios-card">
                                            Translator
                                        </SelectItem>
                                        <SelectItem value="maps" className="text-white hover:bg-ios-card">
                                            Maps & Navigation
                                        </SelectItem>
                                        <SelectItem value="profile" className="text-white hover:bg-ios-card">
                                            User Profile
                                        </SelectItem>
                                        <SelectItem value="ui-ux" className="text-white hover:bg-ios-card">
                                            UI/UX Design
                                        </SelectItem>
                                        <SelectItem value="performance" className="text-white hover:bg-ios-card">
                                            Performance
                                        </SelectItem>
                                        <SelectItem value="other" className="text-white hover:bg-ios-card">
                                            Other
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-semibold text-white mb-2">
                                    Email <span className="text-ios-red">*</span>
                                </label>
                                <Input
                                    type="email"
                                    placeholder="your.email@example.com"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                                    required
                                />
                            </div>

                            {/* Subject */}
                            <div>
                                <label className="block text-sm font-semibold text-white mb-2">
                                    Subject <span className="text-ios-red">*</span>
                                </label>
                                <Input
                                    type="text"
                                    placeholder="Brief summary of your feedback or issue"
                                    value={form.subject}
                                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                                    required
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-semibold text-white mb-2">
                                    Description <span className="text-ios-red">*</span>
                                </label>
                                <Textarea
                                    placeholder={
                                        form.type === 'bug'
                                            ? 'Please describe the issue:\n\n1. What were you trying to do?\n2. What happened instead?\n3. Steps to reproduce (if applicable)'
                                            : 'Please provide detailed information about your feedback or suggestion'
                                    }
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray min-h-[200px]"
                                    required
                                />
                            </div>

                            {/* Submit Button */}
                            <Button
                                type="submit"
                                disabled={loading || !form.category || !form.subject || !form.description}
                                className="w-full bg-ios-blue hover:bg-blue-600 text-white py-3 text-lg font-semibold smooth-transition interactive-tap radius-md"
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
                    <Card className="bg-ios-card border-ios-gray">
                        <CardContent className="p-4">
                            <div className="flex items-start space-x-3">
                                <i className="fas fa-clock text-ios-blue text-xl mt-1"></i>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Response Time</h3>
                                    <p className="text-ios-gray text-sm">
                                        We typically respond within 24-48 hours
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-ios-card border-ios-gray">
                        <CardContent className="p-4">
                            <div className="flex items-start space-x-3">
                                <i className="fas fa-shield-alt text-ios-green text-xl mt-1"></i>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Privacy</h3>
                                    <p className="text-ios-gray text-sm">
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
