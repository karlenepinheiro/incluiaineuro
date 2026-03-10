import React, { Component, ErrorInfo, ReactNode } from "react";
import { RefreshCw } from "lucide-react";


const InlineAlertIcon = ({ className = "w-10 h-10 text-red-500" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white p-8 rounded-xl shadow-xl max-w-lg w-full text-center border border-red-100">
            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <InlineAlertIcon className="text-red-600 h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Ops! Algo deu errado.</h1>
            <p className="text-gray-600 mb-6">
              Ocorreu um erro inesperado na interface. Nossa equipe foi notificada.
            </p>
            <div className="bg-gray-100 p-4 rounded-lg text-left text-xs font-mono text-gray-700 mb-6 overflow-auto max-h-32">
                {this.state.error?.message}
            </div>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              className="bg-brand-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-brand-700 flex items-center justify-center gap-2 mx-auto"
            >
              <RefreshCw size={18} /> Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}