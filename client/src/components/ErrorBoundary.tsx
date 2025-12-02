import React from "react";
import { logError } from "@/lib/logger";

type ErrorBoundaryState = { hasError: boolean };

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    logError("ui_error", { error: String(error?.message || error), info: String(info?.componentStack || "") });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-ios-darker text-white flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-ios-gray mb-4">Please refresh the page. If the issue persists, try signing out and back in.</p>
            <a href="/" className="inline-flex items-center px-4 py-2 rounded-md bg-ios-blue text-white">Go Home</a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

