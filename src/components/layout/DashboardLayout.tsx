import { useState } from "react";
import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import ChatModal from "@/components/chat/ChatModal";
import { Menu } from "lucide-react";

export default function DashboardLayout() {
  const { isChatModalOpen, setIsChatModalOpen, selectedLeadForChat, initialMessage, initialMedia } = useChat();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-noir text-cream overflow-hidden">
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

        {/* Scrollable Page Content */}
        <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
