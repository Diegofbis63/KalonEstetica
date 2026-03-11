import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-noir text-cream overflow-hidden">
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 ml-64 min-h-screen relative flex flex-col">
        {/* Global Glass Background Effect */}
        <div className="fixed inset-0 pointer-events-none opacity-40 overflow-hidden">
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
