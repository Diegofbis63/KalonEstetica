import { useNavigate, useLocation } from "react-router-dom";
import { 
  LayoutGrid, 
  Calendar, 
  Users, 
  DollarSign, 
  Settings 
} from "lucide-react";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: LayoutGrid, label: "Panel", path: "/dashboard" },
    { icon: Calendar, label: "Turnos", path: "/dashboard/appointments" },
    { icon: Users, label: "Clientes", path: "/dashboard/clients" },
    { icon: DollarSign, label: "Caja", path: "/dashboard/income" },
    { icon: Settings, label: "Ajustes", path: "/dashboard/settings" },
  ];

  const isActive = (path: string) => {
    if (path === "/dashboard" && (location.pathname === "/dashboard" || location.pathname === "/dashboard/")) return true;
    return location.pathname === path;
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] bg-noir/80 backdrop-blur-xl border-t border-white/5 pb-safe-area">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center gap-1 w-full h-full relative group transition-all"
            >
              {active && (
                <div className="absolute top-0 w-8 h-0.5 bg-gold rounded-full shadow-[0_0_10px_rgba(194,154,91,0.5)] animate-in fade-in" />
              )}
              <item.icon 
                className={`w-5 h-5 transition-all ${active ? 'text-gold scale-110' : 'text-cream/30 group-hover:text-cream/60'}`} 
              />
              <span className={`text-[9px] font-bold uppercase tracking-widest transition-all ${active ? 'text-gold' : 'text-cream/20'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
