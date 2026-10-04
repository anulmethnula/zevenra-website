import { Component, type ErrorInfo, type ReactNode } from "react";

export class StoreErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { if (import.meta.env.DEV) console.error("Storefront render error", error, info); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="grid min-h-dvh place-content-center bg-paper px-6 text-center"><p className="eyebrow">Something went wrong.</p><h1 className="display mt-4 text-5xl">Please try again.</h1><div className="mt-7 flex justify-center gap-3"><button className="btn btn-dark" onClick={() => { this.setState({ failed: false }); location.reload(); }}>Try again</button><a className="btn" href="/">Return home</a></div></main>;
  }
}
