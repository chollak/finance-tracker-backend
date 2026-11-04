import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** What shows in place of the children once one of them fell: a screen without technical text (#240). */
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches a failure anywhere in the child tree while it draws, shows `fallback` instead and logs the failure — the
 * error itself never reaches the screen (#240). The app's top boundary is in `app/providers`.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
