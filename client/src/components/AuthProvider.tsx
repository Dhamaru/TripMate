import { createContext, ReactNode, useContext } from "react";
import { useAuthStore } from "@/store";
import type { User } from "@shared/schema";

interface AuthContextType {
    user: User | undefined;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const { user, isLoading, isAuthenticated, signIn, signOut } = useAuthStore();

    const login = async (email: string, password: string) => {
        await signIn(email, password);
    };

    return (
        <AuthContext.Provider
            value={{
                user: user as User | undefined,
                isLoading,
                isAuthenticated,
                login,
                logout: signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuthContext() {
    return useContext(AuthContext);
}
