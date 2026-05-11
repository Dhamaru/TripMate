import { useAuthStore } from "@/store/authStore";

export function useAuth() {
  const { user, signOut, isAuthenticated, isLoading } = useAuthStore();

  return {
    user,
    logout: signOut,
    isAuthenticated,
    isLoading,
    signIn: useAuthStore.getState().signIn,
    signUp: useAuthStore.getState().signUp,
    guestSignIn: useAuthStore.getState().guestSignIn,
  };
}
