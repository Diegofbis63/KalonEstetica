import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/components/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/layout/DashboardLayout";

const queryClient = new QueryClient();

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

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              
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
                <Route path="clients" element={<PlaceholderPage title="Clientes" />} />
                <Route path="income" element={<PlaceholderPage title="Ingresos" />} />
                <Route path="services" element={<Dashboard defaultTab="services" />} />
                <Route path="settings" element={<PlaceholderPage title="Configuración" />} />
              </Route>

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
