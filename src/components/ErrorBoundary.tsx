import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    
    // Log to DB via API (Blindaje)
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'critical',
          message: error.message || 'Frontend Crash',
          context: {
            stack: error.stack,
            componentStack: errorInfo.componentStack,
          },
          url: window.location.href
        })
      });
    } catch (e) {
      console.error("Failed to ship log to DB:", e);
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-noir flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-rose/10 flex items-center justify-center border border-rose/20 mb-6">
            <AlertTriangle className="w-8 h-8 text-rose" />
          </div>
          <h1 className="text-3xl font-serif text-gold mb-4">¡Ups! Algo salió mal</h1>
          <p className="text-cream/40 max-w-md mx-auto mb-8 font-sans italic italic">
            Hubo un error al cargar esta sección. Por favor, intenta recargar la página o volver al inicio.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-6 py-3 bg-gold text-noir rounded-full font-sans font-bold text-sm hover:scale-105 transition-all"
            >
              <RefreshCcw className="w-4 h-4" />
              Recargar Página
            </button>
            <Link 
              to="/"
              className="flex items-center gap-2 px-6 py-3 border border-white/10 text-cream/60 rounded-full font-sans font-bold text-sm hover:bg-white/5 transition-all"
            >
              <Home className="w-4 h-4" />
              Ir al Inicio
            </Link>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-12 p-4 bg-noir-light rounded-xl border border-white/5 text-left max-w-2xl overflow-auto">
              <p className="text-rose text-xs font-mono mb-2">{this.state.error?.toString()}</p>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
