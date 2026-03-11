import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Lock, ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/AuthContext";

export default function Auth() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { isAuthenticated } = useAuth();

  // Redirect to dashboard if already logged in (Persistent Session)
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // ─── DEMO MODE BYPASS ───
      if (email === "demo@kalonestetica.com" && password === "demo123") {
        login({
          id: "demo-user",
          email: "demo@kalonestetica.com",
          role: "guest"
        });
        navigate("/dashboard");
        return;
      }

      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al iniciar sesión");
      }

      login({ ...data.user, role: 'admin' });
      navigate("/dashboard");
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-noir flex flex-col items-center justify-center relative overflow-hidden px-4">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gold/[0.04] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-rose/[0.02] rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Back link */}
        <Link
          to="/"
          className="flex items-center gap-2 text-cream/40 hover:text-gold transition-colors text-xs font-sans mb-8 group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
          Volver al sitio
        </Link>

        {/* Logo */}
        <div className="flex flex-col items-center justify-center gap-4 mb-10">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-[0_0_30px_rgba(194,154,91,0.2)]">
            <span className="text-noir font-serif font-bold text-2xl">K</span>
          </div>
          <div className="text-center">
            <span className="text-xl font-serif font-bold tracking-[0.2em] uppercase text-cream">
              KÂLON
            </span>
            <p className="text-[10px] font-sans text-cream/30 tracking-[0.3em] uppercase mt-1">Acceso Administrativo</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-noir-light/40 backdrop-blur-xl border border-cream/5 rounded-2xl p-8 shadow-2xl relative">
          <div className="absolute -top-px left-10 right-10 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

          <h2 className="text-lg font-serif font-bold text-cream text-center mb-1 tracking-wide">
            Iniciar Sesión
          </h2>
          <p className="text-[10px] font-sans uppercase tracking-[0.1em] text-cream/30 text-center mb-8">
            Credenciales de Administrador
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/20 group-focus-within:text-gold transition-colors" />
              <input
                type="email"
                placeholder="Email corporativo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-noir border border-cream/5 rounded-xl px-11 py-3.5 text-sm text-cream placeholder:text-cream/20 focus:outline-none focus:border-gold/30 focus:bg-noir/80 transition-all font-sans"
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/20 group-focus-within:text-gold transition-colors" />
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-noir border border-cream/5 rounded-xl px-11 py-3.5 text-sm text-cream placeholder:text-cream/20 focus:outline-none focus:border-gold/30 focus:bg-noir/80 transition-all font-sans"
              />
            </div>

            {error && (
              <p className="text-xs text-rose-light bg-rose/5 border border-rose/10 rounded-lg px-4 py-3 font-sans">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gold to-gold-light hover:translate-y-[-2px] active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 text-noir font-sans font-bold py-3.5 rounded-xl transition-all shadow-lg hover:shadow-gold/20"
            >
              {loading ? "Verificando..." : "Entrar al Panel"}
              {!loading && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />}
            </button>
          </form>
        </div>

        <p className="mt-12 text-center text-[10px] text-cream/20 uppercase tracking-[0.2em] font-sans">
          © 2026 KÂLON MULTIESPACIO ESTETICO — Sistema de Gestión Premium
        </p>
      </div>
    </div>
  );
}
