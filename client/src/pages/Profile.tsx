import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { authApi } from "@/lib/api/auth.api";
import { apiRequest, getCsrfToken } from "@/lib/queryClient";

export default function Profile() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const queryClient = useQueryClient();
  const { data: userData } = useQuery<User>({
    queryKey: ['/api/v1/auth/user'],
    enabled: true,
  });

  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadStatus("Uploading...");
      setIsUploading(true);
      setUploadProgress(0);
      const fd = new FormData();
      fd.append('image', file);

      const xhr = new XMLHttpRequest();
      const url = '/api/v1/auth/user/avatar';
      return await new Promise((resolve, reject) => {
        xhr.open('POST', url);
        // Raw XHR bypasses apiRequest()'s automatic X-CSRF-Token attachment
        // (needed here instead of fetch for upload-progress events) — without
        // this header the server's CSRF middleware 403s every upload.
        const csrfToken = getCsrfToken();
        if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 100);
            setUploadProgress(percent);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              resolve(json);
            } catch (e) {
              resolve({});
            }
          } else {
            reject(new Error(xhr.responseText || 'Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(fd);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/auth/user'] });
      toast({ title: 'Profile picture updated' });
      setUploadStatus("Upload complete");
      setIsUploading(false);
      setUploadProgress(100);
      setSelectedFileName("");
      setLocalPreviewUrl("");
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not upload picture', variant: 'destructive' });
      setUploadStatus("Upload failed");
      setIsUploading(false);
      setUploadProgress(0);
    }
  });

  const passwordMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authApi.changePassword(data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Password updated successfully' });
      (document.getElementById('currentPassword') as HTMLInputElement).value = '';
      (document.getElementById('newPassword') as HTMLInputElement).value = '';
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.response?.data?.message || 'Could not update password', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authApi.deleteAccount(data);
      return res.data;
    },
    onSuccess: async () => {
      toast({ title: 'Account deleted' });
      await logout();
      navigate('/');
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.response?.data?.message || 'Could not delete account', variant: 'destructive' });
    },
  });

  const profileMutation = useMutation({
    mutationFn: async (payload: Partial<User>) => {
      // Was a raw fetch(), which skips apiRequest()'s automatic
      // X-CSRF-Token header — every save 403'd with "Invalid CSRF token"
      // in production, where CSRF protection is on by default.
      const res = await apiRequest('PUT', '/api/v1/auth/user', {
        firstName: payload.firstName,
        lastName: payload.lastName,
        phoneNumber: (payload as any).phoneNumber,
      });
      if (!res.ok) throw new Error('Failed to update profile');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/auth/user'] });
      toast({ title: 'Profile updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not update profile', variant: 'destructive' });
    },
  });

  const firstName = (userData?.firstName ?? '');
  const lastName = (userData?.lastName ?? '');
  const email = (userData?.email ?? '');
  const profileImageUrl = localPreviewUrl || userData?.avatar || userData?.profileImageUrl || '';
  const phoneNumber = (userData as any)?.phoneNumber ?? '';

  const [countryCode, setCountryCode] = useState<string>('');
  const [phoneLocal, setPhoneLocal] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string>('');

  useEffect(() => {
    const match = (phoneNumber || '').match(/^\+?(\d{1,3})\s*(\d{4,})$/);
    if (match) {
      setCountryCode(match[1]);
      setPhoneLocal(match[2]);
    } else {
      setCountryCode('');
      setPhoneLocal('');
    }
    setPhoneError('');
  }, [phoneNumber]);

  const validatePhone = (code: string, local: string) => {
    const digitsOnly = local.replace(/\D/g, '');
    if (!local || !digitsOnly) return '';
    if (digitsOnly.length < 6 || digitsOnly.length > 15) return 'Enter 6-15 digits';
    return '';
  };

  useEffect(() => {
    setPhoneError(validatePhone(countryCode, phoneLocal));
  }, [countryCode, phoneLocal]);

  const fullPhone = useMemo(() => `+${countryCode} ${phoneLocal.replace(/\D/g, '')}`, [countryCode, phoneLocal]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement & {
      firstName: { value: string };
      lastName: { value: string };
      email: { value: string };
    };
    if (phoneError) {
      toast({ title: 'Invalid phone number', description: phoneError, variant: 'destructive' });
      return;
    }
    const payload: any = {
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      email: form.email.value.trim(),
    };
    if (phoneLocal.trim()) {
      payload.phoneNumber = fullPhone;
    }
    profileMutation.mutate(payload);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (!allowed.includes(file.type) || file.size > maxSize) {
        toast({ title: 'Invalid file', description: 'Please select a JPEG, PNG, GIF, or WEBP up to 5MB.', variant: 'destructive' });
        e.currentTarget.value = '';
        setSelectedFileName("");
        setLocalPreviewUrl("");
        return;
      }
      const url = URL.createObjectURL(file);
      setSelectedFileName(file.name);
      setLocalPreviewUrl(url);
      navigate(`/app/profile/crop?src=${encodeURIComponent(url)}`);
      e.currentTarget.value = '';
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Your Profile</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Account Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form key={userData?._id ?? userData?.email ?? 'loading'} onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 space-x-0 sm:space-x-4">
              <div
                className="w-24 h-24 relative group cursor-pointer shrink-0"
                onClick={openFileDialog}
                title="Change picture"
              >
                <Avatar className="w-24 h-24 rounded-full overflow-hidden bg-muted ring-2 ring-offset-2 ring-offset-background ring-[#1D4E89]">
                  <AvatarImage src={profileImageUrl} alt="Profile" className="object-cover transition-transform group-hover:scale-105" />
                  <AvatarFallback className="text-2xl">{firstName?.[0] || email?.[0] || 'U'}</AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <svg xmlns="http://www.w3.org/2000/svg" className="text-white" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
              </div>
              <div className="flex flex-col gap-2 items-center sm:items-start w-full">
                <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="avatar-input"
                    aria-hidden="true"
                  />
                  <Button
                    type="button"
                    onClick={openFileDialog}
                    aria-label="Upload profile picture"
                    variant="secondary"
                    disabled={isUploading}
                    className="gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    {isUploading ? 'Uploading…' : 'Change Photo'}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const src = profileImageUrl || '';
                      if (!src) { toast({ title: 'No image', description: 'Upload an image first to edit.' }); return; }
                      navigate(`/app/profile/crop?src=${encodeURIComponent(src)}`);
                    }}
                    aria-label="Edit current picture"
                    variant="outline"
                    className="gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Adjust
                  </Button>
                </div>
                {selectedFileName && (
                  <span className="text-sm text-muted-foreground text-center sm:text-left" aria-live="polite">{selectedFileName}</span>
                )}
              </div>
            </div>
            {isUploading && (
              <div className="mt-2" aria-live="polite">
                <div className="w-full bg-secondary rounded h-2">
                  <div className="bg-primary h-2 rounded" style={{ width: `${uploadProgress}%` }}></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{uploadStatus} ({uploadProgress}%)</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">First Name</label>
                <Input name="firstName" defaultValue={firstName} />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Last Name</label>
                <Input name="lastName" defaultValue={lastName} />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Email</label>
                <Input name="email" defaultValue={email} disabled />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Phone Number</label>
                <div className="flex gap-2">
                  <div className="w-28">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger aria-label="Country code">
                        <SelectValue placeholder="Code" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="91">+91 (IN)</SelectItem>
                        <SelectItem value="1">+1 (US)</SelectItem>
                        <SelectItem value="44">+44 (UK)</SelectItem>
                        <SelectItem value="61">+61 (AU)</SelectItem>
                        <SelectItem value="65">+65 (SG)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Input
                      aria-label="Phone number"
                      value={phoneLocal}
                      onChange={(e) => setPhoneLocal(e.target.value)}
                      placeholder="Enter phone"
                      className={`${phoneError ? 'border-red-500 focus:border-red-500' : ''}`}
                    />
                    {phoneError && (
                      <p id="phone-error" className="text-xs text-red-400 mt-1" aria-live="assertive">{phoneError}</p>
                    )}
                  </div>
                </div>
              </div>

            </div>

            <div className="flex items-center justify-end">
              <Button type="submit" aria-label="Save changes" disabled={profileMutation.isPending || !!phoneError}>
                {profileMutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Security</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget as HTMLFormElement & {
              currentPassword: { value: string };
              newPassword: { value: string };
            };
            passwordMutation.mutate({
              currentPassword: form.currentPassword.value,
              newPassword: form.newPassword.value
            });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Current Password</label>
              <Input type="password" id="currentPassword" name="currentPassword" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">New Password</label>
              <Input type="password" id="newPassword" name="newPassword" required />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Connected Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center shrink-0">
                <i className="fab fa-google text-foreground text-lg"></i>
              </div>
              <div>
                <h4 className="font-medium text-white">Google</h4>
                <p className="text-xs text-muted-foreground">
                  {(userData as any)?.googleConnected ? 'Connected' : 'Sign in with Google'}
                </p>
              </div>
            </div>
            {(userData as any)?.googleConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await apiRequest('POST', '/api/v1/auth/google/disconnect');
                    if (res.ok) {
                      queryClient.invalidateQueries({ queryKey: ['/api/v1/auth/user'] });
                      toast({ title: 'Google disconnected' });
                    } else {
                      toast({ title: 'Error', description: 'Could not disconnect Google', variant: 'destructive' });
                    }
                  } catch {
                    toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
                  }
                }}
              >
                Disconnect
              </Button>
            ) : (
              <a href="/api/v1/auth/google">
                <Button variant="secondary" size="sm">Connect</Button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border border-red-500/20">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">Sign Out</h3>
              <p className="text-sm text-muted-foreground">Sign out of your account on this device</p>
            </div>
            <Button
              variant="destructive"
              onClick={async () => { await logout(); navigate('/'); }}
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
          <div className="mt-8 pt-6 border-t border-red-500/20">
            <h3 className="font-medium text-red-500 mb-2">Danger Zone</h3>
            <p className="text-sm text-muted-foreground mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
                const form = e.currentTarget as HTMLFormElement & { deletePassword?: { value: string } };
                deleteMutation.mutate({ password: form.deletePassword?.value || '' });
              }
            }} className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Confirm Password</label>
                <Input type="password" name="deletePassword" placeholder="Enter password to confirm" required={!userData?.googleConnected} />
              </div>
              <Button type="submit" variant="destructive" disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Account'}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
