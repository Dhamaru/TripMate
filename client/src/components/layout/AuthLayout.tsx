import React from "react";
import { TripMateLogo } from "@/components/TripMateLogo";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-ios-darker text-white">
      <header className="fixed top-0 left-0 right-0 h-16 z-50 flex items-center px-4">
        <TripMateLogo size="md" showText={true} />
      </header>
      <main className="pt-header-gap">
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
