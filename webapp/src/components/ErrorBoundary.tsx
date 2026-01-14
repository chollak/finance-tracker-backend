import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'app' | 'page' | 'component';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console
    console.error('ErrorBoundary caught error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      level: this.props.level
    });

    // Optional error callback (for analytics/logging)
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI based on level
      const { level = 'component' } = this.props;

      if (level === 'app') {
        // Critical app-level error - full page fallback
        return (
          <div className="flex items-center justify-center min-h-screen p-8 bg-gray-50">
            <div className="max-w-md w-full">
              <Alert variant="destructive">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle className="text-lg font-semibold mb-2">
                  Application Error
                </AlertTitle>
                <AlertDescription className="space-y-4">
                  <p>
                    Something went wrong with the application. Please try reloading the page.
                  </p>
                  {this.state.error && (
                    <details className="text-sm bg-red-50 p-3 rounded border border-red-200">
                      <summary className="cursor-pointer font-medium mb-2">
                        Error Details
                      </summary>
                      <code className="text-xs break-all">
                        {this.state.error.message}
                      </code>
                    </details>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={this.handleReload} className="flex-1">
                      Reload Page
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          </div>
        );
      }

      if (level === 'page') {
        // Page-level error - inline fallback
        return (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Page Error</AlertTitle>
              <AlertDescription className="mt-2 space-y-3">
                <p>This page encountered an error and couldn't load properly.</p>
                <div className="flex gap-2">
                  <Button onClick={this.handleReset} variant="outline" size="sm">
                    Try Again
                  </Button>
                  <Button onClick={this.handleReload} size="sm">
                    Reload Page
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        );
      }

      // Component-level error - minimal fallback
      return (
        <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
          <p className="text-sm text-red-800 mb-2">
            This component failed to load.
          </p>
          <Button onClick={this.handleReset} variant="outline" size="sm">
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
