import { NavLink } from "react-router-dom";
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  TrendingUp, 
  Sparkles, 
  Settings, 
  LogOut,
  ArrowLeft,
  X
} from "lucide-react";
import { useAuth } from "@/components/AuthContext";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { logout, user } = useAuth();

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Calendar, label: "Citas", path: "/dashboard/appointments" },
    { icon: Users, label: "Clientes", path: "/dashboard/clients" },
    { icon: TrendingUp, label: "Ingresos", path: "/dashboard/income" },
    { icon: Sparkles, label: "Servicios", path: "/dashboard/services" },
    { icon: Settings, label: "Configuración", path: "/dashboard/settings" },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 w-64 bg-noir/80 backdrop-blur-2xl border-r border-cream/5 z-[70] flex flex-col
        transition-transform duration-300 lg:translate-x-0
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        {/* Brand Header */}
        <div className="p-8 border-b border-cream/5 relative">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-[0_0_20px_rgba(194,154,91,0.2)]">
              <span className="text-noir font-serif font-bold text-lg">K</span>
            </div>
            <div>
              <span className="text-sm font-serif font-bold tracking-[0.2em] uppercase text-cream">
                KÂLON
              </span>
              <p className="text-[9px] text-cream/30 font-sans tracking-wide uppercase">Operativo Premium</p>
            </div>
          </div>
          
          {/* Mobile Close Button */}
          <button 
            onClick={onClose}
            className="lg:hidden absolute top-8 right-6 p-2 text-cream/30 hover:text-gold transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/dashboard"}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group
                ${isActive 
                  ? "bg-gold text-noir font-bold shadow-lg shadow-gold/10" 
                  : "text-cream/40 hover:bg-cream/5 hover:text-cream"}
              `}
            >
              <item.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
              <span className="text-sm font-sans tracking-tight">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer / User Info */}
        <div className="p-4 border-t border-cream/5 space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <div className="w-8 h-8 rounded-lg bg-cream/10 flex items-center justify-center text-xs font-serif font-bold text-gold">
              {(user?.username || user?.email || "A")[0].toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[11px] font-sans font-medium text-cream truncate">
                {user?.username || user?.email || "Administrador"}
              </p>
              <p className="text-[9px] text-cream/20 font-sans tracking-tight uppercase">Acceso {user?.role || "Admin"}</p>
            </div>
          </div>

          <div className="space-y-1">
            <NavLink
              to="/"
              className="flex items-center gap-4 px-4 py-3 text-cream/40 hover:text-gold transition-colors text-xs font-sans group"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              Volver al sitio
            </NavLink>
            
            <button
              onClick={logout}
              className="w-full flex items-center gap-4 px-4 py-3 text-cream/40 hover:text-rose transition-colors text-xs font-sans border-t border-transparent hover:border-cream/5"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
