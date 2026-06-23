import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/components/AuthContext";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import ErrorBoundary from "./components/ErrorBoundary";

// Lazy loading for admin routes (resolves heavy bundle load issue on landing page)
const Auth = lazy(() => import("./pages/Auth"));
const DashboardLayout = lazy(() => import("./components/layout/DashboardLayout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const CategoryDetail = lazy(() => import("./pages/CategoryDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Clients = lazy(() => import("./pages/Clients"));
const Incomes = lazy(() => import("./pages/Incomes"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos de validez
      gcTime: 1000 * 60 * 30, // Mantener en caché 30 min
      retry: 1,
      refetchOnWindowFocus: false, // Evitar refetch al cambiar de pestaña que puede saturar conexiones
    },
  },
});

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-noir flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/auth" />;
};

// Placeholder components for new segments
const PlaceholderPage = ({ title }: { title: string }) => (
  <div className="p-10 flex flex-col items-center justify-center min-h-[80vh] gap-4">
    <div className="w-16 h-16 rounded-2xl bg-gold/5 flex items-center justify-center border border-gold/10">
      <span className="text-gold font-serif font-bold text-2xl uppercase tracking-widest">{title[0]}</span>
    </div>
    <div className="text-center">
      <h2 className="text-xl font-serif font-bold text-gold mb-2">{title} — Próximamente</h2>
      <p className="text-cream/30 max-w-sm mx-auto text-sm italic font-sans">
        Estamos trabajando para traerte la mejor experiencia administrativa para KÂLON.
      </p>
    </div>
  </div>
);

import { ChatProvider } from "./context/ChatContext";

const LoadingSpinner = () => (
  <div className="min-h-screen bg-noir flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ChatProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <ErrorBoundary>
                <Suspense fallback={<LoadingSpinner />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/servicios/:category" element={<CategoryDetail />} />
                    
                    {/* Rutas Protegidas de Administración */}
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <DashboardLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Dashboard />} />
                      <Route path="appointments" element={<Dashboard />} /> {/* For now reuse Dashboard */}
                      <Route path="clients" element={<Clients />} />
                      <Route path="income" element={<Incomes />} />
                      <Route path="services" element={<Dashboard defaultTab="services" />} />
                      <Route path="settings" element={<Settings />} />
                    </Route>

                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </BrowserRouter>
          </TooltipProvider>
        </ChatProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
