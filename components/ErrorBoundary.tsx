"use client";

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-6 py-8 text-center">
            <h2 className="text-lg font-semibold text-red-200">
              Etwas ist schiefgelaufen
            </h2>
            <p className="mt-2 text-sm text-red-200/80">
              {this.state.error?.message ?? "Ein unbekannter Fehler ist aufgetreten."}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background transition hover:brightness-110"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
