import { createContext, ReactNode, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { User } from "@shared/schema";

interface AuthResponse {
    user: User;
    token: string;
}

interface AuthContextType {
    user: User | undefined;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string, remember: boolean) => Promise<User>;
    register: (email: string, password: string, firstName: string, lastName: string) => Promise<User>;
    logout: () => Promise<void>;
    token: string | null;
    setAuthTokenFromOAuth: (token: string | null) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();
    const [token, setToken] = useState<string | null>(null);
    const [isInitializingToken, setIsInitializingToken] = useState(true);

    // Initialize by attempting silent refresh using httpOnly cookie or window global
    useEffect(() => {
        (async () => {
            // Check for global token (from OAuth redirect)
            if ((window as any).__authToken) {
                setToken((window as any).__authToken);
                setIsInitializingToken(false);
                return;
            }

            if (!token && import.meta.env.MODE === 'test') {
                const legacy = localStorage.getItem('authToken');
                if (legacy) {
                    (window as any).__authToken = legacy;
                    setToken(legacy);
                }
            }
            try {
                const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    const newToken = String(data?.token || "");
                    if (newToken) {
                        (window as any).__authToken = newToken;
                        setToken(newToken);
                        // ensure user refetches with token set
                        queryClient.invalidateQueries({ queryKey: ["/api/v1/auth/user"] });
                    }
                }
            } catch { }
            setIsInitializingToken(false);
        })();
    }, []);

    const { data: user, isLoading, error } = useQuery({
        queryKey: ["/api/v1/auth/user"],
        queryFn: async () => {
            const response = await fetch("/api/v1/auth/user", {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                credentials: "include",
            });
            if (!response.ok) {
                if (response.status === 401) {
                    // Token is invalid, clear it
                    (window as any).__authToken = null;
                    setToken(null);
                    throw new Error('Invalid token');
                }
                throw new Error('Failed to fetch user');
            }
            return response.json();
        },
        retry: false,
        enabled: !!token,
    });

    const setAuthTokenFromOAuth = (newToken: string | null) => {
        if (newToken) {
            (window as any).__authToken = newToken;
            setToken(newToken);
            // Ensure user info is refreshed
            queryClient.invalidateQueries({ queryKey: ["/api/v1/auth/user"] });
        } else {
            (window as any).__authToken = null;
            setToken(null);
            queryClient.clear();
        }
    };

    const login = async (email: string, password: string, remember: boolean) => {
        try {
            const response = await fetch("/api/v1/auth/signin", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password, remember, device: 'web' }),
                credentials: "include",
            });

            if (!response.ok) {
                let message = "Sign in failed";
                try {
                    const error = await response.json();
                    message = error?.message || message;
                } catch { }
                if (response.status === 400) message = "Invalid input. Check email and password.";
                else if (response.status === 401) message = "Invalid credentials";
                else if (response.status === 429) message = "Too many requests. Please try again later.";
                else if (response.status >= 500) message = "Service unavailable. Please try again later.";
                throw new Error(message);
            }

            const data: AuthResponse = await response.json();
            const { token: newToken, user: userData } = data;
            (window as any).__authToken = newToken;
            setToken(newToken);

            // Update query cache
            queryClient.setQueryData(["/api/v1/auth/user"], userData);

            // Invalidate to ensure the query refetches
            queryClient.invalidateQueries({ queryKey: ["/api/v1/auth/user"] });

            return userData;
        } catch (error) {
            const msg = (error as any)?.message || "Sign in failed";
            if (/Failed to fetch/i.test(msg)) {
                throw new Error("Network error. Check your connection and try again.");
            }
            throw new Error(msg);
        }
    };

    const register = async (
        email: string,
        password: string,
        firstName: string,
        lastName: string
    ) => {
        try {
            const response = await fetch("/api/v1/auth/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password, firstName, lastName, device: 'web' }),
                credentials: "include",
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || "Sign up failed");
            }

            const data: AuthResponse = await response.json();
            const { token: newToken, user: userData } = data;

            (window as any).__authToken = newToken;
            setToken(newToken);

            // Update query cache
            queryClient.setQueryData(["/api/v1/auth/user"], userData);

            return userData;
        } catch (error) {
            console.error("Sign up error:", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            const response = await fetch("/api/v1/auth/signout", {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                credentials: "include",
            });
            if (!response.ok) {
                console.error("Sign out API error:", response.statusText);
            }
        } catch (error) {
            console.error("Sign out error:", error);
        } finally {
            // Clear token and cache regardless of API call success
            (window as any).__authToken = null;
            setToken(null);
            queryClient.clear();
        }
    };

    const combinedLoading = isInitializingToken || isLoading;

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading: combinedLoading,
                isAuthenticated: !!user && !!token && !error,
                login,
                register,
                logout,
                token,
                setAuthTokenFromOAuth,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
