import React from "react";
import { logError } from "@/lib/logger";

type ErrorBoundaryState = { hasError: boolean; error?: Error };

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    logError("ui_error", { error: String(error?.message || error), info: String(info?.componentStack || "") });
    console.error("ErrorBoundary caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-ios-darker text-white flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-ios-gray mb-4">
              {this.state.error?.message || "Please refresh the page."}
            </p>
            <details className="text-xs text-ios-gray/50 mb-4 text-left bg-black/20 p-2 rounded overflow-auto max-h-32">
              <summary>Error Details</summary>
              <pre>{this.state.error?.stack}</pre>
            </details>
            <a href="/" className="inline-flex items-center px-4 py-2 rounded-md bg-ios-blue text-white">Go Home</a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

