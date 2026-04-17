import { useState } from "react";
import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import ChatModal from "@/components/chat/ChatModal";
import { Menu, Plus } from "lucide-react";
import { toast } from "sonner";

import BottomNav from "./BottomNav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarPlus, UserPlus, CircleDollarSign, LayoutDashboard, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { isChatModalOpen, setIsChatModalOpen, selectedLeadForChat, initialMessage, initialMedia } = useChat();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-noir text-cream overflow-hidden touch-none selection:bg-gold/30">
      {/* Global Chat Modal */}
      <ChatModal 
        open={isChatModalOpen} 
        onOpenChange={setIsChatModalOpen} 
        lead={selectedLeadForChat}
        initialMessage={initialMessage}
        initialMedia={initialMedia}
      />
      
      {/* Fixed Sidebar */}
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      {/* Main Content Area */}
      <main className="flex-1 lg:ml-64 relative flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden flex-none flex items-center justify-between px-6 py-4 border-b border-cream/5 bg-noir z-[60]">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center">
                <span className="text-noir font-serif font-bold text-sm">K</span>
              </div>
              <span className="text-xs font-serif font-bold tracking-[0.2em] uppercase text-cream">
                KÂLON
              </span>
           </div>
           {/* Sidebar trigger as secondary option */}
           <button 
             onClick={() => setIsMobileMenuOpen(true)}
             className="p-2 text-cream/40 hover:text-gold transition-colors"
           >
              <Menu className="w-6 h-6" />
           </button>
        </div>

        {/* Global Glass Background Effect */}
        <div className="fixed inset-0 pointer-events-none opacity-40 overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[20%] w-[1000px] h-[800px] bg-gold/[0.03] rounded-full blur-[150px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[10%] w-[800px] h-[600px] bg-rose/[0.02] rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-20 lg:pb-0 scroll-smooth w-full box-border">
          <Outlet />
        </div>

        {/* Mobile App Navigation - FAB */}
        <div className="lg:hidden fixed bottom-28 right-6 z-50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="w-16 h-16 rounded-full bg-gold text-noir shadow-[0_10px_40px_rgba(194,154,91,0.4)] flex items-center justify-center active:scale-95 transition-all outline-none"
              >
                <Plus className="w-8 h-8 stroke-[3px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              side="top" 
              align="end" 
              sideOffset={15}
              className="w-64 bg-noir/95 backdrop-blur-2xl border-white/10 rounded-3xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <div className="px-3 py-2 mb-2 border-b border-white/5">
                <p className="text-[10px] uppercase font-black tracking-widest text-gold">Acceso Rápido</p>
              </div>
              
              <DropdownMenuItem 
                onClick={() => navigate('/dashboard/appointments')}
                className="flex items-center gap-4 p-4 rounded-2xl focus:bg-gold/10 focus:text-gold transition-colors cursor-pointer mb-1 group"
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-focus:scale-110 transition-transform">
                  <CalendarPlus className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-serif font-bold">Nuevo Turno</span>
                  <span className="text-[9px] text-cream/30 uppercase font-black">Agendar Cita</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem 
                onClick={() => navigate('/dashboard/clients')}
                className="flex items-center gap-4 p-4 rounded-2xl focus:bg-emerald-500/10 focus:text-emerald-400 transition-colors cursor-pointer mb-1 group"
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-focus:scale-110 transition-transform">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-serif font-bold">Nuevo Prospecto</span>
                  <span className="text-[9px] text-cream/30 uppercase font-black">Añadir Lead</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem 
                onClick={() => navigate('/dashboard/income')}
                className="flex items-center gap-4 p-4 rounded-2xl focus:bg-amber-500/10 focus:text-amber-400 transition-colors cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-focus:scale-110 transition-transform">
                  <CircleDollarSign className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-serif font-bold">Registrar Pago</span>
                  <span className="text-[9px] text-cream/30 uppercase font-black">Nuevo Ingreso</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <BottomNav />
      </main>
    </div>
  );
}
