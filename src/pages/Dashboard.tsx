import { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  LogOut, Users, CalendarCheck, TrendingUp, Edit, MessageSquare, 
  Trash2, CheckCircle2, XCircle, AlertTriangle, Clock, 
  ArrowRight, ShieldAlert, Zap, Bell, CalendarDays, ChevronRight, 
  Phone, MoreHorizontal, Info, X, Plus, Search, ClipboardList,
  Send, Paperclip, Image as LucideImage
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthContext";
import { toast } from "sonner";
import ServicesManagement from "@/components/dashboard/ServicesManagement";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Lead {
  id: string;
  client_name: string;
  contact_info: {
    email?: string;
    phone?: string;
  };
  status: string;
  intent_score: number;
  created_at: string;
  is_bot_enabled: boolean;
  category_name?: string;
  canManage?: boolean;
  phone?: string; // Unified phone from API RBAC
  updated_at?: string;
  chat_history?: { role: string; content: string; media_url?: string; created_at?: string }[];
}

interface Appointment {
  id: string;
  lead_id?: string;
  client_name?: string;
  phone?: string;
  service_type: string;
  category_name?: string;
  date_time: string;
  status: string;
  created_at: string;
  canManage?: boolean;
  selected_services?: Array<{
    id: string;
    title: string;
    price: number | string;
    duration: string;
    category_name?: string;
  }>;
  total_price?: number;
  total_duration?: number;
  is_bot_enabled?: boolean;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
}

export interface Service {
  id: string;
  title: string;
  description: string;
  price: string;
  duration: string;
  image_url: string;
  active: boolean;
  sort_order: number;
}

export default function Dashboard({ defaultTab = 'dashboard' }: { defaultTab?: 'dashboard' | 'appointments' | 'services' | 'leads' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user: authUser } = useAuth();
  const queryClient = useQueryClient();
  
  const currentTab = useMemo(() => {
    if (location.pathname.endsWith('/dashboard/services')) return 'services';
    if (location.pathname.endsWith('/dashboard/appointments')) return 'appointments';
    if (location.pathname.endsWith('/dashboard') || location.pathname === '/dashboard/') return 'dashboard';
    if (defaultTab === 'leads') return 'appointments';
    return defaultTab;
  }, [location.pathname, defaultTab]);

  const [dateFilter, setDateFilter] = useState<'all' | 'hoy' | 'tomorrow'>('all');

  // Dialog states
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [selectedLeadForChat, setSelectedLeadForChat] = useState<Lead | null>(null);
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);
  const [selectedLeadForAppt, setSelectedLeadForAppt] = useState<Lead | null>(null);
  const [isEditAppointmentModalOpen, setIsEditAppointmentModalOpen] = useState(false);
  const [selectedAppointmentForEdit, setSelectedAppointmentForEdit] = useState<Appointment | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formService, setFormService] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formClientName, setFormClientName] = useState("");
  
  // Multi-service state
  const [selectedServices, setSelectedServices] = useState<Appointment['selected_services']>([]);
  const [cartCategory, setCartCategory] = useState<string>("");
  const [cartService, setCartService] = useState<string>("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete ] = useState<{ id: string, type: 'lead' | 'appointment' | 'service' } | null>(null);

  // Today for timeline
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
  }, []);

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to load dashboard');
      return res.json();
    }
  });

  const { data: timelineData } = useQuery({
    queryKey: ['timeline', todayStr],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?date=${todayStr}`);
      if (!res.ok) throw new Error('Failed to load timeline');
      return res.json();
    },
    enabled: currentTab === 'dashboard'
  });

  const { data: servData } = useQuery({
    queryKey: ['services-list'],
    queryFn: async () => {
      const res = await fetch('/api/services');
      if (!res.ok) throw new Error('Failed to load services');
      return res.json();
    }
  });

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/categories').then(res => res.json())
  });

  const { data: subServicesData } = useQuery({
    queryKey: ['sub-services', cartCategory],
    queryFn: () => fetch(`/api/services?category_id=${cartCategory}`).then(res => res.json()),
    enabled: !!cartCategory
  });

  // --- Start: NEW CHAT POLLING LOGIC ---
  const { data: chatHistoryData, refetch: refetchChat } = useQuery({
    queryKey: ['chat', selectedLeadForChat?.id],
    queryFn: async () => {
      if (!selectedLeadForChat) return { history: [] };
      const res = await fetch(`/api/leads/chat?leadId=${selectedLeadForChat.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch chat logs');
      return res.json();
    },
    enabled: !!selectedLeadForChat && isChatModalOpen,
    refetchInterval: isChatModalOpen ? 1000 : false, // Poll every 1s while open for fluid UX
  });

  const chatLogs = useMemo(() => chatHistoryData?.history || [], [chatHistoryData?.history]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isChatModalOpen && scrollRef.current) {
        // Instant scroll when opening or payload changes
        const timeoutId = setTimeout(() => {
            scrollRef.current?.scrollIntoView({ behavior: 'auto' });
        }, 50);
        return () => clearTimeout(timeoutId);
    }
  }, [isChatModalOpen, chatLogs.length]);
  // --- End: CHAT POLLING LOGIC ---

  const services: Service[] = useMemo(() => servData?.services || [], [servData?.services]);

  const updateAppointment = useMutation({
    mutationFn: async ({ id, status, date_time, service_type, client_name, phone, selected_services, total_price, total_duration }: { 
      id: string, 
      status?: string, 
      date_time?: string, 
      service_type?: string, 
      client_name?: string, 
      phone?: string,
      selected_services?: Appointment['selected_services'],
      total_price?: number,
      total_duration?: number
    }) => {
      const res = await fetch(`/api/appointments?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, date_time, service_type, client_name, phone, selected_services, total_price, total_duration })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: () => {
        setIsEditAppointmentModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['timeline'] });
        toast.success("Cita actualizada");
    },
    onError: (err) => {
        toast.error(err.message);
    }
  });

  const createAppointment = useMutation({
    mutationFn: async ({ lead_id, date_time, service_type, category_id, selected_services, total_price, total_duration }: { 
      lead_id: string, 
      date_time: string, 
      service_type: string, 
      category_id?: string,
      selected_services?: Appointment['selected_services'],
      total_price?: number,
      total_duration?: number
    }) => {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id, date_time, service_type, category_id, selected_services, total_price, total_duration })
      });
      if (!res.ok) throw new Error('Failed to create appointment');
      return res.json();
    },
    onSuccess: () => {
      setIsNewAppointmentModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      toast.success("Turno agendado correctamente");
    }
  });

  const deleteLead = useMutation({
    mutationFn: (id: string) => fetch(`/api/leads/chat?leadId=${id}`, { method: 'DELETE' }),
    onSuccess: () => {
        setDeleteConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        toast.success("Lead eliminado");
    },
    onError: () => toast.error("Error al eliminar lead")
  });



  const deleteAppointment = useMutation({
    mutationFn: async (id: string) => {
        const res = await fetch(`/api/appointments?id=${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to delete');
        }
        return res.json();
    },
    onSuccess: () => {
        setDeleteConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['timeline'] });
        toast.success("Cita eliminada");
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const deleteService = useMutation({
    mutationFn: (id: string) => fetch(`/api/services?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => {
        setDeleteConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ['services-list'] });
        toast.success("Servicio eliminado");
    },
    onError: () => toast.error("Error al eliminar servicio")
  });

  const toggleBotMutation = useMutation({
    mutationFn: async ({ leadId, isBotEnabled }: { leadId: string, isBotEnabled: boolean }) => {
      const res = await fetch(`/api/leads/chat?leadId=${leadId}&action=toggle-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBotEnabled })
      });
      if (!res.ok) throw new Error('Failed to toggle bot');
      return res.json();
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        toast.info("Estado del bot actualizado");
    }
  });

  const sendReplyMutation = useMutation({
    mutationFn: async ({ leadId, message, mediaData }: { leadId: string, message?: string, mediaData?: string }) => {
      const res = await fetch('/api/leads/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ leadId, message, mediaData })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al enviar mensaje');
      }
      return res.json();
    },
    onMutate: async (newReply) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['chat', newReply.leadId] });
      const previousChat = queryClient.getQueryData(['chat', newReply.leadId]);
      
      queryClient.setQueryData(['chat', newReply.leadId], (old: { history: Array<{ role: string; content: string; media_url?: string; media_data?: string; created_at?: string; isPending?: boolean }> } | undefined) => ({
        ...old,
        history: [...(old?.history || []), {
          role: 'admin',
          content: newReply.message,
          created_at: new Date().toISOString(),
          isPending: true
        }]
      }));

      return { previousChat };
    },
    onSuccess: () => {
      setReplyMessage("");
      setIsUploading(false);
      toast.success("Mensaje enviado");
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chat', variables.leadId] });
      setIsUploading(false);
    },
    onError: (err: Error, newReply, context) => {
      if (context?.previousChat) {
        queryClient.setQueryData(['chat', newReply.leadId], context.previousChat);
      }
      setIsUploading(false);
      toast.error(err.message);
    }
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Solo se permiten imágenes");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      sendReplyMutation.mutate({ 
        leadId: selectedLeadForChat!.id, 
        message: "", 
        mediaData: base64 
      });
    };
    reader.readAsDataURL(file);
    // Reset input for same file selection
    e.target.value = '';
  };

  const leads: Lead[] = useMemo(() => dashData?.leads || [], [dashData?.leads]);
  const appointments: Appointment[] = useMemo(() => dashData?.appointments || [], [dashData?.appointments]);
  const timelineAppts: Appointment[] = useMemo(() => timelineData?.appointments || [], [timelineData?.appointments]);

  const filteredAppointments = useMemo(() => {
    const target = new Date();
    const activeAppts = appointments.filter(a => a.status !== 'canceled');
    if (dateFilter === 'tomorrow') {
      target.setDate(target.getDate() + 1);
      return activeAppts.filter(a => new Date(a.date_time).toDateString() === target.toDateString());
    }
    if (dateFilter === 'hoy') {
      return activeAppts.filter(a => new Date(a.date_time).toDateString() === target.toDateString());
    }
    return activeAppts;
  }, [appointments, dateFilter]);

  const stats = [
    { icon: Users, label: "Clientes Activos", value: leads.length, color: "text-gold", path: "/dashboard/clients" },
    { icon: CalendarCheck, label: "Turnos", value: appointments.length, color: "text-amber-400", path: "/dashboard/appointments" },
    { icon: TrendingUp, label: "Ingresos", value: `${leads.length > 0 ? Math.round((appointments.length / leads.length) * 100) : 0}%`, color: "text-emerald-400", path: "/dashboard/income" },
  ];

  // Logic for Operation Center
  const upNext = useMemo(() => {
    const now = new Date();
    // Filter out past and canceled
    const upcoming = timelineAppts
        .filter(a => a.status !== 'canceled' && new Date(a.date_time) >= now)
        .sort((a,b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
    return upcoming[0] || null;
  }, [timelineAppts]);

  const actionAlerts = useMemo(() => {
    const pendingAppts = appointments.filter(a => a.status === 'pending');
    const hotLeads = leads.filter(l => l.intent_score > 80 && l.status !== 'qualified');
    return { pendingAppts, hotLeads };
  }, [appointments, leads]);

  if (dashLoading) {
    return (
        <div className="h-full flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-noir">
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-10">
        <div className="max-w-[1600px] mx-auto space-y-12 pb-20">
          
          {currentTab === 'dashboard' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-1000">
              {/* 1. KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((s, i) => (
                  <div 
                    key={i} 
                    onClick={() => s.path && navigate(s.path)}
                    className={`p-6 rounded-2xl border border-white/[0.03] bg-noir-light/20 backdrop-blur-md group hover:border-gold/20 transition-all ${s.path ? 'cursor-pointer hover:bg-noir-light/40' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 rounded-xl bg-noir-light border border-white/5 shadow-inner">
                          <s.icon className={`w-5 h-5 ${s.color}`} />
                        </div>
                        <span className="text-[10px] text-cream/30 uppercase tracking-[0.2em] font-bold">{s.label}</span>
                      </div>
                      {s.path && <ArrowRight className="w-3 h-3 text-gold/20 group-hover:text-gold/60 transition-colors" />}
                    </div>
                    <p className="text-4xl font-serif font-bold group-hover:text-gold transition-colors">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* 2. Main Layout Split */}
              <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
                {/* Column Left: Daily Timeline (70%) */}
                <div className="lg:col-span-7 space-y-6">
                   <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-6 bg-gold rounded-full shadow-[0_0_10px_rgba(194,154,91,0.5)]" />
                        <h3 className="text-xl font-serif font-bold tracking-tight">Agenda del Día</h3>
                      </div>
                      <Badge variant="outline" className="border-gold/20 text-gold/60 uppercase text-[9px] tracking-widest px-3">
                        {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </Badge>
                   </div>
                   
                   <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-gold/40 before:via-gold/10 before:to-transparent">
                      {timelineAppts.length > 0 ? (
                        timelineAppts
                          .sort((a,b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime())
                          .map((appt, i) => (
                          <div 
                            key={appt.id} 
                            className={`relative p-5 rounded-2xl border transition-all animate-in fade-in slide-in-from-left-4 ${
                              appt.canManage 
                                ? 'bg-gold/5 border-gold/20 shadow-[0_0_20px_rgba(194,154,91,0.05)]' 
                                : 'bg-white/[0.02] border-white/5 opacity-80'
                            }`}
                            style={{ animationDelay: `${i * 100}ms` }}
                          >
                            {/* Dot indicator */}
                            <div className={`absolute -left-[27px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 ${
                              appt.canManage ? 'bg-gold border-noir' : 'bg-noir-light border-white/10'
                            }`} />

                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0 pr-4">
                                <div className="flex items-center gap-3 mb-1.5">
                                  <Clock className={`w-3.5 h-3.5 ${appt.canManage ? 'text-gold' : 'text-cream/20'}`} />
                                  <span className={`text-sm font-bold font-sans ${appt.canManage ? 'text-gold' : 'text-cream/40'}`}>
                                    {new Date(appt.date_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}hs
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                  <h4 className={`text-lg font-serif font-bold ${appt.canManage ? 'text-cream' : 'text-cream/30'}`}>
                                    {appt.canManage ? appt.client_name : `Ocupado — ${appt.category_name}`}
                                  </h4>
                                  {appt.canManage && (
                                    <>
                                      {appt.phone && (
                                        <a 
                                          href={`https://wa.me/${appt.phone.replace(/\D/g, '')}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-[10px] font-bold font-mono hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all group/wa whitespace-nowrap"
                                        >
                                          <Phone className="w-3 h-3 group-hover/wa:scale-110 transition-transform" />
                                          {appt.phone}
                                        </a>
                                      )}
                                      {appt.total_duration ? (
                                        <div className="inline-flex items-center gap-4 px-5 py-3 rounded-2xl bg-gold/10 border border-gold/30 shadow-[0_0_30px_rgba(194,154,91,0.15)] group/duration hover:bg-gold/15 transition-all">
                                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gold/20 border border-gold/20 flex-shrink-0">
                                            <Clock className="w-5 h-5 text-gold animate-pulse" />
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-[10px] text-gold/50 uppercase font-black tracking-[0.2em] leading-none mb-1">Duración</span>
                                            <span className="text-2xl font-serif font-black text-gold leading-none tracking-tight">
                                              {appt.total_duration >= 60 
                                                ? `${Math.floor(appt.total_duration/60)}h ${appt.total_duration%60 > 0 ? `${appt.total_duration%60}m` : ''}`
                                                : `${appt.total_duration} min`
                                              }
                                            </span>
                                          </div>
                                        </div>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                                {appt.canManage && (
                                  <div className="mt-3">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="flex items-center gap-1.5 hover:text-gold transition-colors text-left text-[11px] font-bold uppercase tracking-widest bg-white/5 hover:bg-gold/5 border border-white/10 hover:border-gold/30 px-3 py-1.5 rounded-lg text-cream/50 group/btn">
                                            <ClipboardList className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                            Ver Servicios <span className="text-cream/30 border-l border-white/10 pl-1.5 ml-0.5">({appt.selected_services?.length || 0})</span>
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-72 bg-noir/95 backdrop-blur-xl border-gold/20 shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-0 z-50">
                                          <div className="p-3 border-b border-white/5 bg-white/5">
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-gold mb-1">Detalle del Turno</p>
                                            <p className="text-xs text-cream/60">Servicios agendados:</p>
                                          </div>
                                          <ScrollArea className="h-[180px]">
                                            <div className="p-3 space-y-3">
                                              {appt.selected_services && appt.selected_services.length > 0 ? (
                                                appt.selected_services.map((s, idx) => (
                                                  <div key={idx} className="flex justify-between items-start gap-2 group/item">
                                                    <div className="space-y-0.5">
                                                      <p className="text-xs font-bold text-cream group-hover/item:text-gold transition-colors">{s.title}</p>
                                                      <p className="text-[10px] text-cream/40 flex items-center gap-1">
                                                        <Clock className="w-2.5 h-2.5" /> {s.duration}
                                                      </p>
                                                    </div>
                                                    <p className="text-xs font-sans font-bold text-cream/80 whitespace-nowrap">${Number(s.price).toLocaleString('es-AR')}</p>
                                                  </div>
                                                ))
                                              ) : (
                                                <div className="text-[10px] text-cream/20 italic py-2">Sin sub-servicios detallados</div>
                                              )}
                                            </div>
                                          </ScrollArea>
                                          {(appt.total_price || appt.total_duration) && (
                                            <div className="p-3 border-t border-white/5 bg-gold/5 space-y-2">
                                              {appt.total_duration && (
                                                <div className="flex justify-between items-center text-[10px] text-cream/40">
                                                  <p className="uppercase tracking-widest leading-none">Duración Total</p>
                                                  <p className="font-bold flex items-center gap-1 leading-none text-cream/80">
                                                    <Clock className="w-2.5 h-2.5" />
                                                    {appt.total_duration >= 60 
                                                      ? `${Math.floor(appt.total_duration/60)}H${appt.total_duration%60 > 0 ? ` ${appt.total_duration%60}M` : ''}`
                                                      : `${appt.total_duration} MIN`
                                                    }
                                                  </p>
                                                </div>
                                              )}
                                              {appt.total_price && appt.total_price > 0 && (
                                                <div className="flex justify-between items-center">
                                                  <p className="text-xs font-bold text-gold uppercase tracking-tighter leading-none">Total</p>
                                                  <p className="text-sm font-sans font-black text-gold whitespace-nowrap leading-none">${Number(appt.total_price).toLocaleString('es-AR')}</p>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </PopoverContent>
                                      </Popover>
                                  </div>
                                )}
                              </div>
                              
                              {appt.canManage && (
                                <div className="flex items-center gap-2">
                                  {appt.canManage && (
                                    <button 
                                      onClick={() => { 
                                        const leadObj: Lead = {
                                          id: appt.lead_id!,
                                          client_name: appt.client_name!,
                                          contact_info: { phone: appt.phone },
                                          status: appt.status,
                                          intent_score: 100,
                                          is_bot_enabled: appt.is_bot_enabled || false,
                                          created_at: appt.created_at,
                                          canManage: appt.canManage
                                        };
                                        setSelectedLeadForChat(leadObj); 
                                        setIsChatModalOpen(true); 
                                      }}
                                      disabled={!appt.lead_id || !appt.canManage}
                                      className={`p-3 rounded-xl bg-white/5 border border-white/10 transition-all flex items-center justify-center group/btn hover:text-gold hover:border-gold/30 ${
                                        appt.canManage && appt.lead_id ? '' : 'opacity-20 cursor-not-allowed'
                                      }`}
                                    >
                                      <MessageSquare className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                                    </button>
                                  )}
                                  {appt.canManage && (
                                    <button 
                                      onClick={() => {
                                        setSelectedAppointmentForEdit(appt);
                                        const d = new Date(appt.date_time);
                                        setFormDate(d.toLocaleDateString('sv-SE'));
                                        setFormTime(d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }));
                                        setFormService(appt.service_type);
                                        setFormClientName(appt.client_name || "");
                                        setFormPhone(appt.phone || "");
                                        setSelectedServices(appt.selected_services || []);
                                        setIsEditAppointmentModalOpen(true);
                                      }}
                                      className="p-3 rounded-xl bg-gold text-noir hover:scale-110 active:scale-95 transition-all shadow-lg shadow-gold/10"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-10 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                          <CalendarDays className="w-12 h-12 text-cream/10 mx-auto mb-4" />
                          <p className="text-cream/20 font-serif italic text-sm">No hay citas registradas para hoy</p>
                        </div>
                      )}
                   </div>
                </div>

                {/* Column Right: Operation Center (30%) */}
                <div className="lg:col-span-3 space-y-8">
                   {/* Up Next Card */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-[0.2em] text-gold/60">
                         <Zap className="w-3 h-3 fill-gold/60" />
                         Proximo Turno
                      </div>
                      <div className="p-6 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-noir-light/40 to-noir-light/40 backdrop-blur-xl relative overflow-hidden group shadow-2xl">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-gold/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-gold/10 transition-all" />
                         {upNext ? (
                           <div className="relative z-10 space-y-4">
                              <div>
                                <p className="text-[10px] font-sans text-white/40 uppercase tracking-widest mb-1">Empieza en aprox.</p>
                                <p className="text-3xl font-serif font-bold text-gold">
                                    {(() => {
                                      const diffMs = new Date(upNext.date_time).getTime() - new Date().getTime();
                                      const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
                                      if (diffMins >= 60) {
                                        const h = Math.floor(diffMins / 60);
                                        const m = diffMins % 60;
                                        return `${h}h ${m > 0 ? `${m}m` : ''}`;
                                      }
                                      return `${diffMins} min`;
                                    })()}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xl font-serif font-bold text-cream truncate">{upNext.client_name}</p>
                                <p className="text-xs text-cream/40 italic">{upNext.service_type}</p>
                              </div>
                              <button 
                                onClick={() => navigate('/dashboard/appointments')}
                                className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase font-bold tracking-widest hover:bg-gold hover:text-noir transition-all"
                              >Revisar Detalles</button>
                           </div>
                         ) : (
                           <p className="text-center text-cream/20 font-serif py-10 italic">Nadie en espera</p>
                         )}
                      </div>
                   </div>

                   {/* Action Hub */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-[0.2em] text-cream/40">
                         <Bell className="w-3 h-3" />
                         Action Hub
                      </div>
                      <div className="space-y-3">
                         {actionAlerts.pendingAppts.length > 0 && (
                           <div 
                            onClick={() => navigate('/dashboard/appointments')}
                            className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center gap-4 cursor-pointer hover:bg-amber-500/10 transition-all group"
                           >
                              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <ShieldAlert className="w-5 h-5 text-amber-500" />
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-bold text-cream">Citas Pendientes</p>
                                <p className="text-[10px] text-cream/30">{actionAlerts.pendingAppts.length} requieren confirmación</p>
                              </div>
                              <ChevronRight className="w-3 h-3 text-cream/20 group-hover:translate-x-1 transition-transform" />
                           </div>
                         )}
                         
                         {actionAlerts.hotLeads.length > 0 && (
                           <div 
                            onClick={() => navigate('/dashboard/appointments')}
                            className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-4 cursor-pointer hover:bg-emerald-500/10 transition-all group"
                           >
                              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <TrendingUp className="w-5 h-5 text-emerald-400" />
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-bold text-cream">Leads Calientes</p>
                                <p className="text-[10px] text-cream/30">{actionAlerts.hotLeads.length} de alta intención</p>
                              </div>
                              <ChevronRight className="w-3 h-3 text-cream/20 group-hover:translate-x-1 transition-transform" />
                           </div>
                         )}

                         {actionAlerts.pendingAppts.length === 0 && actionAlerts.hotLeads.length === 0 && (
                           <div className="p-8 text-center border border-white/5 rounded-2xl opacity-20">
                              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
                              <p className="text-[10px] uppercase font-bold tracking-widest">Al día</p>
                           </div>
                         )}
                      </div>
                   </div>
                </div>
              </div>
            </div>
          )}

          {currentTab === 'appointments' && (
             <div className="space-y-12">
              {/* Agenda Section */}
              <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-gold rounded-full" />
                    <h3 className="text-xl font-serif font-bold">Gestión de Citas Agendadas</h3>
                  </div>
                  <div className="flex gap-1 bg-noir-light p-1 rounded-full border border-white/5">
                    {['all', 'hoy', 'tomorrow'].map(f => (
                      <button 
                        key={f} 
                        onClick={() => setDateFilter(f as 'all' | 'hoy' | 'tomorrow')} 
                        className={`px-4 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-widest transition-all ${dateFilter === f ? 'bg-gold text-noir' : 'text-cream/30 hover:text-cream'}`}
                      >
                        {f === 'all' ? 'Ver Todos' : f === 'hoy' ? 'Hoy' : 'Mañana'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-cream/5 bg-noir-light/20 overflow-hidden shadow-2xl backdrop-blur-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-cream/5 hover:bg-transparent">
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14">Cliente</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14">Contacto</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 w-fit">Servicio</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 text-center">Duración</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 text-center">Fecha / Hora</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 text-center">Precio</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 text-center">Estado</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-4 h-14 text-center">Bot</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-4 h-14 text-center">Wsp</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAppointments.map((a, i) => (
                        <TableRow key={a.id} className={`border-b border-cream/5 hover:bg-cream/[0.02] transition-colors group animate-in fade-in slide-in-from-bottom-2 ${!a.canManage ? 'opacity-40 grayscale-[0.5]' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
                          <TableCell className="px-5 py-6">
                            <div className="font-serif font-bold text-lg text-cream tracking-tight whitespace-nowrap">
                              {a.canManage ? a.client_name : `Ocupado - ${a.category_name}`}
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-6">
                            {a.canManage && a.phone && (
                              <a 
                                href={`https://wa.me/${a.phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-bold font-mono hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all group/wa whitespace-nowrap"
                              >
                                <Phone className="w-3 h-3 group-hover/wa:scale-110 transition-transform" />
                                {a.phone}
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="px-5 py-6">
                            <div className="flex items-center gap-2 text-base font-serif text-cream/80 group-hover:text-cream transition-colors whitespace-nowrap w-fit">
                              <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(194,154,91,0.4)] ${a.canManage ? 'bg-gold' : 'bg-white/10'}`} />
                              {a.canManage ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="flex items-center gap-1.5 hover:text-gold transition-colors text-left">
                                      {Array.from(new Set((a.selected_services || []).map(s => s.category_name || "Servicio"))).join(" + ") || "Varios Servicios"}
                                      <Info className="w-3.5 h-3.5" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-64 bg-noir/95 backdrop-blur-xl border-gold/20 shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-0">
                                    <div className="p-3 border-b border-white/5 bg-white/5">
                                      <p className="text-[10px] uppercase font-bold tracking-widest text-gold mb-1">Detalle del Turno</p>
                                      <p className="text-xs text-cream/60">Servicios seleccionados:</p>
                                    </div>
                                    <ScrollArea className="max-h-48">
                                      <div className="p-3 space-y-3">
                                        {a.selected_services && a.selected_services.length > 0 ? (
                                          a.selected_services.map((s, idx) => (
                                            <div key={idx} className="flex justify-between items-start gap-2 group/item">
                                              <div className="space-y-0.5">
                                                <p className="text-xs font-bold text-cream group-hover/item:text-gold transition-colors">{s.title}</p>
                                                <p className="text-[10px] text-cream/40 flex items-center gap-1">
                                                  <Clock className="w-2.5 h-2.5" /> {s.duration}
                                                </p>
                                              </div>
                                                <p className="text-xs font-sans font-bold text-cream/80 whitespace-nowrap">${Number(s.price).toLocaleString('es-AR')}</p>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="text-[10px] text-cream/20 italic italic py-2">Sin sub-servicios detallados</div>
                                        )}
                                      </div>
                                    </ScrollArea>
                                    {(a.total_price || a.total_duration) && (
                                      <div className="p-3 border-t border-white/5 bg-gold/5 space-y-2">
                                        {a.total_duration && (
                                          <div className="flex justify-between items-center text-[10px] text-cream/40">
                                            <p className="uppercase tracking-widest uppercase">Duración Total</p>
                                            <p className="font-bold flex items-center gap-1">
                                              <Clock className="w-2.5 h-2.5" />
                                              {a.total_duration >= 60 
                                                ? `${Math.floor(a.total_duration/60)}H${a.total_duration%60 > 0 ? ` ${a.total_duration%60}M` : ''}`
                                                : `${a.total_duration} MIN`
                                              }
                                            </p>
                                          </div>
                                        )}
                                        {a.total_price && a.total_price > 0 && (
                                          <div className="flex justify-between items-center">
                                            <p className="text-xs font-bold text-gold uppercase tracking-tighter">Total</p>
                                              <p className="text-sm font-sans font-black text-gold whitespace-nowrap">${Number(a.total_price).toLocaleString('es-AR')}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                              ) : (
                                a.service_type
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-6 text-center font-sans">
                            <div className="text-sm font-bold text-cream/70 flex items-center justify-center gap-2 whitespace-nowrap">
                              <Clock className="w-3.5 h-3.5 text-gold/60" />
                              {a.total_duration ? (
                                a.total_duration >= 60 
                                  ? `${Math.floor(a.total_duration/60)}H${a.total_duration%60 > 0 ? ` ${a.total_duration%60}M` : ''}`
                                  : `${a.total_duration}M`
                              ) : "-"}
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-6 text-center font-sans">
                            <div className="text-sm font-medium text-cream/60 capitalize whitespace-nowrap">
                              {new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(a.date_time))}
                              <span className="mx-2 text-cream/10">•</span>
                              <span className="text-gold font-bold">
                                {new Date(a.date_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}hs
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-6 text-center font-sans">
                            <div className="text-sm font-bold text-gold/90 whitespace-nowrap">
                              {a.total_price ? `$${Number(a.total_price || 0).toLocaleString('es-AR')}` : "-"}
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-6 text-center">
                            <Badge 
                              variant="outline" 
                              className={`
                                text-[9px] font-black tracking-[0.15em] px-3 py-1 rounded-full border shadow-sm mx-auto
                                ${ (a.status === 'scheduled' || a.status === 'confirmed')
                                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' 
                                  : a.status === 'completed'
                                  ? 'border-sky-500/30 bg-sky-500/5 text-sky-400'
                                  : a.status === 'canceled'
                                  ? 'border-rose-500/30 bg-rose-500/5 text-rose-400'
                                  : 'border-gold/30 bg-gold/5 text-gold'}
                              `}
                            >
                              { (a.status === 'scheduled' || a.status === 'confirmed') ? 'CONFIRMADA' : 
                                a.status === 'completed' ? 'REALIZADA' : 
                                a.status === 'canceled' ? 'CANCELADA' : 'PENDIENTE'}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                                <Switch 
                                    checked={a.is_bot_enabled} 
                                    onCheckedChange={(val) => toggleBotMutation.mutate({ leadId: a.lead_id!, isBotEnabled: val })}
                                    className="data-[state=checked]:bg-gold scale-75"
                                    disabled={!a.lead_id}
                                />
                                <span className={`text-[8px] font-black tracking-widest ${a.is_bot_enabled ? 'text-emerald-400' : 'text-cream/20'}`}>
                                    {a.is_bot_enabled ? 'ON' : 'OFF'}
                                </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-6 text-center">
                              <button 
                                  onClick={() => { 
                                    const leadObj: Lead = {
                                      id: a.lead_id!,
                                      client_name: a.client_name!,
                                      contact_info: { phone: a.phone },
                                      status: a.status,
                                      intent_score: 100,
                                      is_bot_enabled: a.is_bot_enabled || false,
                                      created_at: a.created_at,
                                      canManage: a.canManage
                                    };
                                    setSelectedLeadForChat(leadObj); 
                                    setIsChatModalOpen(true); 
                                  }}
                                  disabled={!a.lead_id || !a.canManage}
                                  className={`px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 transition-all mx-auto flex items-center justify-center gap-2 group/btn ${
                                    a.canManage && a.lead_id ? 'text-cream/40 hover:text-gold hover:border-gold/30' : 'opacity-20 cursor-not-allowed'
                                  }`}
                                >
                                  <MessageSquare className="w-4 h-4" /> Wsp
                                </button>
                          </TableCell>
                          <TableCell className="px-5 py-6 text-right">
                            {a.canManage && (
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => {
                                    setSelectedAppointmentForEdit(a);
                                    const d = new Date(a.date_time);
                                    setFormDate(d.toLocaleDateString('sv-SE'));
                                    setFormTime(d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }));
                                    setFormService(a.service_type);
                                    setFormClientName(a.client_name || "");
                                    setFormPhone(a.phone || "");
                                    setSelectedServices(a.selected_services || []);
                                    setIsEditAppointmentModalOpen(true);
                                  }} 
                                  className="p-2 rounded-lg bg-cream/5 text-cream/40 hover:text-gold hover:bg-gold/10 transition-all border border-transparent hover:border-gold/20"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => { setItemToDelete({ id: a.id, type: 'appointment' }); setDeleteConfirmOpen(true); }} 
                                  className="p-2 rounded-lg bg-rose/5 text-rose/40 hover:text-rose hover:bg-rose/10 transition-all border border-transparent hover:border-rose/20"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="p-2 rounded-lg bg-cream/5 text-cream/20 hover:text-cream transition-all border border-transparent hover:bg-white/5">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-noir-light border-cream/5 text-cream/80">
                                    <DropdownMenuItem className="focus:bg-gold/10 focus:text-gold cursor-pointer" onClick={() => updateAppointment.mutate({ id: a.id, status: 'REALIZADA' })}>
                                      <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como Realizado
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="focus:bg-amber-500/10 focus:text-amber-400 cursor-pointer" onClick={() => updateAppointment.mutate({ id: a.id, status: 'pending' })}>
                                      <Clock className="w-4 h-4 mr-2" /> Marcar como Pendiente
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="focus:bg-rose/10 focus:text-rose cursor-pointer" onClick={() => updateAppointment.mutate({ id: a.id, status: 'canceled' })}>
                                      <XCircle className="w-4 h-4 mr-2" /> Cancelar Cita
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-white/5" />
                                    <DropdownMenuItem className="focus:bg-emerald-500/10 focus:text-emerald-400 cursor-pointer" onClick={() => window.open(`https://wa.me/${a.phone?.replace(/\D/g, '')}`, '_blank')}>
                                      <MessageSquare className="w-4 h-4 mr-2" /> Enviar Recordatorio
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredAppointments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="h-48 text-center text-cream/10 italic font-serif">
                            <CalendarCheck className="w-8 h-8 mx-auto mb-2 opacity-5" />
                            No hay turnos registrados para este criterio
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              {/* Leads Section */}
              <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-6 bg-gold rounded-full" />
                  <h3 className="text-xl font-serif font-bold">Clientes Potenciales</h3>
                </div>
                <div className="rounded-2xl border border-cream/5 bg-noir-light/20 overflow-hidden shadow-2xl backdrop-blur-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-white/5 hover:bg-transparent">
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14">Prospecto</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14">Contacto</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 text-center">Interés</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 text-center">Estado Bot</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 text-center">Última Interacción</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-5 h-14 text-right">Gestión</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((l, i) => (
                        <TableRow key={l.id} className={`border-b border-cream/5 hover:bg-cream/[0.02] group transition-colors animate-in fade-in slide-in-from-bottom-2 ${!l.canManage ? 'opacity-40' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
                          <TableCell className="px-5 py-6">
                            <div className="font-serif font-bold text-cream text-lg tracking-tight leading-tight whitespace-nowrap">{l.canManage ? l.client_name : `Interesado - ${l.category_name}`}</div>
                          </TableCell>
                          <TableCell className="px-5 py-6">
                            {l.phone && (
                              <a 
                                href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-bold font-mono hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all group/wa whitespace-nowrap"
                              >
                                <Phone className="w-3 h-3 group-hover/wa:scale-110 transition-transform" />
                                {l.phone}
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="px-5 py-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                                <span className="text-sm font-bold text-emerald-400">{l.intent_score}%</span>
                                <Badge variant="outline" className={`text-[9px] font-black border ${l.intent_score > 70 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' : l.intent_score > 40 ? 'border-amber-500/30 text-amber-500 bg-amber-500/5' : 'border-rose-500/30 text-rose-500 bg-rose-500/5'}`}>
                                    {l.intent_score > 70 ? 'ALTA' : l.intent_score > 40 ? 'MEDIA' : 'BAJA'}
                                </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                                <Switch 
                                    checked={l.is_bot_enabled} 
                                    onCheckedChange={(val) => toggleBotMutation.mutate({ leadId: l.id, isBotEnabled: val })}
                                    className="data-[state=checked]:bg-gold scale-75"
                                />
                                <span className={`text-[8px] font-black tracking-widest ${l.is_bot_enabled ? 'text-emerald-400' : 'text-cream/20'}`}>
                                    {l.is_bot_enabled ? 'ON' : 'OFF'}
                                </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-6 text-center">
                            <div className="text-sm text-cream/40 flex flex-col items-center">
                                {l.updated_at || l.created_at ? (
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <span>{new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(l.updated_at || l.created_at))}</span>
                                        <span className="text-cream/10">•</span>
                                        <span className="text-gold font-bold">
                                            {new Date(l.updated_at || l.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}hs
                                        </span>
                                    </div>
                                ) : '-'}
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-6 text-right">
                            {l.canManage && (
                              <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => { setSelectedLeadForChat(l); setIsChatModalOpen(true); }}
                                    disabled={!l.canManage}
                                    className={`px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold font-mono uppercase transition-all flex items-center gap-2 group/btn ${
                                      l.canManage ? 'text-cream/40 hover:text-gold hover:border-gold/30' : 'opacity-20 cursor-not-allowed'
                                    }`}
                                  >
                                    <MessageSquare className="w-4 h-4 group-hover/btn:scale-110 transition-transform" /> Wsp
                                  </button>
                                <button 
                                  onClick={() => { 
                                    setSelectedLeadForAppt(l); 
                                    setSelectedServices([]);
                                    setCartCategory("");
                                    setCartService("");
                                    setIsNewAppointmentModalOpen(true); 
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs font-bold font-mono uppercase text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center gap-2"
                                >
                                  <CalendarCheck className="w-4 h-4" /> Agendar
                                </button>
                                <button 
                                  onClick={() => { setItemToDelete({ id: l.id, type: 'lead' }); setDeleteConfirmOpen(true); }} 
                                  className="p-2 rounded-lg bg-rose/5 text-rose/40 hover:text-rose hover:bg-rose/10 transition-all border border-transparent hover:border-rose/20"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
             </div>
          )}

          {currentTab === 'services' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <ServicesManagement />
            </div>
          )}
        </div>
      </div>

      {/* --- MODALS --- */}
      
      {/* 1. Chat History Modal */}
      <Dialog open={isChatModalOpen} onOpenChange={setIsChatModalOpen}>
        <DialogContent className="bg-noir border border-gold/20 text-cream max-w-lg p-0 overflow-hidden flex flex-col h-[80vh]">
            <DialogHeader className="p-6 border-b border-white/5">
                <DialogTitle className="font-serif text-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center">
                        <Users className="w-5 h-5 text-gold" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-cream leading-none mb-1">{selectedLeadForChat?.client_name}</p>
                        <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-black">Online • Aura AI Activo</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-gold/20 text-gold text-[9px]">ID: {selectedLeadForChat?.id.slice(0,8)}</Badge>
                </DialogTitle>
            </DialogHeader>

            <ScrollArea className="flex-1 p-6 bg-[url('https://www.transparenttextures.com/patterns/dark-leather.png')]">
                <div className="space-y-6">
                  {chatLogs.length > 0 ? (
                      chatLogs.map((m, i) => {
                          const isUser = m.role === 'user';
                          const isAdmin = m.role === 'admin';
                          const isBot = m.role === 'bot';

                          return (
                            <div key={i} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[85%] space-y-1 ${isUser ? 'items-start' : 'items-end'} flex flex-col`}>
                                    <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-xl border backdrop-blur-md transition-all ${
                                        isUser 
                                          ? 'bg-noir-light/60 border-white/5 text-cream/80 rounded-tl-none ring-1 ring-white/5' 
                                          : isAdmin 
                                          ? 'bg-gradient-to-br from-emerald-600/90 to-emerald-800/90 text-white rounded-tr-none border-emerald-400/20'
                                          : 'bg-gradient-to-br from-gold/30 to-gold/10 text-gold rounded-tr-none border-gold/40'
                                    } ${m.isPending ? 'opacity-50 scale-95' : 'opacity-100'}`}>
                                        <div className="flex items-center justify-between gap-4 mb-2">
                                          <p className="text-[8px] uppercase tracking-[0.2em] font-black opacity-40">
                                            {isUser ? 'Cliente' : isAdmin ? 'Soporte KÂLON' : 'Aura I.A.'}
                                          </p>
                                          {m.isPending && <Clock className="w-2.5 h-2.5 animate-spin opacity-30" />}
                                        </div>
                                        
                                        {(m.media_url || m.media_data) && (
                                          <div className="mb-3 rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-inner group/img relative">
                                            <img 
                                              src={m.media_url || m.media_data} 
                                              alt="Comprobante / Multimedia" 
                                               className="max-w-full h-auto cursor-zoom-in hover:scale-105 transition-transform duration-500" 
                                              onClick={() => setLightboxImage(m.media_url || m.media_data || null)}
                                            />
                                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                              <Plus className="w-6 h-6 text-white drop-shadow-lg" />
                                            </div>
                                          </div>
                                        )}
                                        
                                        <p className="font-medium whitespace-pre-wrap">{m.content}</p>
                                    </div>
                                    <span className="text-[9px] text-cream/20 font-bold px-1 italic">
                                      {m.created_at ? new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'Enviando...'}
                                    </span>
                                </div>
                            </div>
                          );
                      })
                  ) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 italic py-20 text-center">
                          <MessageSquare className="w-12 h-12 mb-4 opacity-10" />
                          <p className="text-sm uppercase tracking-widest font-black">Silencio en el canal</p>
                          <p className="text-[10px] mt-2">Inicia una conversación o espera un mensaje del cliente.</p>
                      </div>
                  )}
                  <div ref={scrollRef} />
                </div>
            </ScrollArea>

            <div className="p-4 bg-noir-light/50 border-t border-white/5 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || sendReplyMutation.isPending}
                  className="p-3 rounded-2xl bg-white/5 border border-white/10 text-cream/40 hover:text-gold hover:border-gold/30 transition-all disabled:opacity-20"
                >
                  {isUploading ? <div className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    placeholder="Escribe una respuesta manual..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && replyMessage.trim()) {
                        sendReplyMutation.mutate({ leadId: selectedLeadForChat!.id, message: replyMessage });
                      }
                    }}
                    className="w-full bg-noir border border-white/10 rounded-2xl py-3 px-5 text-sm outline-none focus:border-gold/50 transition-all pr-12"
                  />
                  <button 
                    onClick={() => {
                      if (replyMessage.trim()) {
                        sendReplyMutation.mutate({ leadId: selectedLeadForChat!.id, message: replyMessage });
                      }
                    }}
                    disabled={!replyMessage.trim() || sendReplyMutation.isPending}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gold text-noir hover:scale-105 active:scale-95 disabled:opacity-30 disabled:grayscale transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-[8px] text-center text-cream/20 uppercase tracking-widest font-bold mt-3">
                Al responder manualmente, el bot se pausará para este cliente (Próximamente)
              </p>
            </div>
        </DialogContent>
      </Dialog>

      {/* 2. New Appointment Modal */}
      <Dialog open={isNewAppointmentModalOpen} onOpenChange={setIsNewAppointmentModalOpen}>
        <DialogContent className="bg-noir border border-gold/20 text-cream max-w-xl">
            <DialogHeader>
                <DialogTitle className="font-serif text-xl">Agendar Cita Manual</DialogTitle>
                <DialogDescription>Convierte este lead en un turno confirmado con múltiples servicios</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
                {/* Multi-Service Selector */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-gold">Selección de Servicios (POS Style)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Categoría</label>
                        <Select value={cartCategory} onValueChange={setCartCategory}>
                          <SelectTrigger className="bg-noir-light border-white/10 rounded-xl h-12">
                            <SelectValue placeholder="Categoría..." />
                          </SelectTrigger>
                          <SelectContent className="bg-noir-light border-white/10 text-cream">
                            {catData?.categories?.map((c: Category) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Servicio</label>
                        <Select value={cartService} onValueChange={setCartService} disabled={!cartCategory}>
                          <SelectTrigger className="bg-noir-light border-white/10 rounded-xl h-12">
                            <SelectValue placeholder="Servicio..." />
                          </SelectTrigger>
                          <SelectContent className="bg-noir-light border-white/10 text-cream">
                            {subServicesData?.services?.map((s: Service) => (
                              <SelectItem key={s.id} value={s.id}>{s.title} - ${Number(s.price).toLocaleString('es-AR')}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (!cartService) return;
                      const sObj = subServicesData.services.find((s: Service) => s.id === cartService);
                      if (sObj) {
                        setSelectedServices(prev => [...prev!, {
                          id: sObj.id,
                          title: sObj.title,
                          price: sObj.price,
                          duration: sObj.duration || "30 min",
                          category_name: catData?.categories?.find((c: Category) => c.id === cartCategory)?.name
                        }]);
                        setCartService("");
                      }
                    }}
                    disabled={!cartService}
                    className="w-full py-2.5 rounded-xl bg-gold/10 text-gold border border-gold/20 text-[10px] uppercase font-bold tracking-widest hover:bg-gold hover:text-noir transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Añadir Tratamiento
                  </button>
                </div>

                {/* Selected Services List */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold flex justify-between">
                    Tratamientos Añadidos
                    <span>{selectedServices?.length || 0} items</span>
                  </label>
                  <ScrollArea className="h-40 rounded-xl border border-white/5 bg-noir-light/30 p-2">
                    {selectedServices && selectedServices.length > 0 ? (
                      <div className="space-y-2">
                        {selectedServices.map((s, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 group">
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-cream">{s.title}</p>
                              <p className="text-[10px] text-cream/40 whitespace-nowrap">{s.duration} • ${Number(s.price).toLocaleString('es-AR')}</p>
                            </div>
                            <button 
                              onClick={() => setSelectedServices(prev => prev!.filter((_, i) => i !== idx))}
                              className="p-1.5 rounded-lg bg-rose/5 text-rose/40 hover:text-rose transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-cream/10 italic">
                        <CalendarDays className="w-8 h-8 mb-2 opacity-10" />
                        <p className="text-[10px] uppercase tracking-tighter">Sin servicios seleccionados</p>
                      </div>
                    )}
                  </ScrollArea>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Fecha</label>
                        <input 
                          type="date" 
                          value={formDate} 
                          onChange={e => setFormDate(e.target.value)} 
                          className="w-full bg-noir-light border border-white/10 rounded-xl p-3 outline-none focus:border-gold [color-scheme:dark]" 
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Hora</label>
                        <input 
                          type="time" 
                          value={formTime} 
                          onChange={e => setFormTime(e.target.value)} 
                          className="w-full bg-noir-light border border-white/10 rounded-xl p-3 outline-none focus:border-gold [color-scheme:dark]" 
                        />
                    </div>
                </div>

                {/* Total Footer */}
                <div className="p-4 rounded-2xl bg-gold/5 border border-gold/10 flex justify-between items-center mt-4">
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-gold/60">Total del Turno</p>
                    <p className="text-2xl font-serif font-black text-gold whitespace-nowrap">
                      ${Number(selectedServices?.reduce((acc, s) => acc + Number(s.price), 0) || 0).toLocaleString('es-AR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold tracking-[0.1em] text-cream/30">Duración Est.</p>
                    <p className="text-sm font-sans font-bold text-cream/60">
                      ~ {(() => {
                        const totalMins = selectedServices?.reduce((acc, s) => acc + parseInt(s.duration || "0"), 0) || 0;
                        return totalMins >= 60 
                          ? `${Math.floor(totalMins/60)}H${totalMins%60 > 0 ? ` ${totalMins%60}M` : ''}`
                          : `${totalMins} MIN`;
                      })()}
                    </p>
                  </div>
                </div>
            </div>
            <DialogFooter className="gap-2">
                <button onClick={() => setIsNewAppointmentModalOpen(false)} className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest opacity-20 hover:opacity-100 transition-opacity">Cancelar</button>
                <button 
                    disabled={createAppointment.isPending || !selectedServices?.length}
                    onClick={() => {
                        if (!formDate || !formTime) {
                            toast.error("Por favor completa los campos de fecha y hora");
                            return;
                        }
                        createAppointment.mutate({ 
                          lead_id: selectedLeadForAppt!.id, 
                          date_time: new Date(`${formDate}T${formTime}`).toISOString(), 
                          service_type: selectedServices![0].title + (selectedServices!.length > 1 ? "..." : ""),
                          selected_services: selectedServices,
                          total_price: selectedServices?.reduce((acc, s) => acc + Number(s.price), 0),
                          total_duration: selectedServices?.reduce((acc, s) => acc + parseInt(s.duration || "0"), 0)
                        });
                    }} 
                    className="flex-1 py-4 bg-gradient-to-r from-gold to-[#d4af37] text-noir rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-gold/20 hover:-translate-y-1 transition-all"
                >
                    {createAppointment.isPending ? 'Procesando...' : 'Confirmar y Agendar Turno'}
                </button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Edit Appointment Modal */}
      <Dialog open={isEditAppointmentModalOpen} onOpenChange={setIsEditAppointmentModalOpen}>
        <DialogContent className="bg-noir border border-gold/20 text-cream max-w-xl">
            <DialogHeader>
                <DialogTitle className="font-serif text-xl border-l-4 border-gold pl-3">Redefinir Cita</DialogTitle>
                <DialogDescription>Modifica los detalles del turno programado con soporte multi-servicio</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Nombre del Cliente</label>
                        <input type="text" value={formClientName} onChange={e => setFormClientName(e.target.value)} className="w-full bg-noir-light border border-white/10 rounded-xl p-3 focus:border-gold outline-none" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">WhatsApp</label>
                        <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)} className="w-full bg-noir-light border border-white/10 rounded-xl p-3 focus:border-gold outline-none" />
                    </div>
                </div>

                {/* Multi-Service Selection (POS Style) */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-gold">Añadir Tratamientos</p>
                    <Info className="w-3.5 h-3.5 text-gold/40" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={cartCategory} onValueChange={setCartCategory}>
                      <SelectTrigger className="bg-noir-light border-white/10">
                        <SelectValue placeholder="Categoría" />
                      </SelectTrigger>
                      <SelectContent className="bg-noir-light border-white/10 text-cream">
                        {catData?.categories?.map((c: Category) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={cartService} onValueChange={setCartService} disabled={!cartCategory}>
                      <SelectTrigger className="bg-noir-light border-white/10">
                        <SelectValue placeholder="Sub-servicio" />
                      </SelectTrigger>
                      <SelectContent className="bg-noir-light border-white/10 text-cream">
                          {subServicesData?.services?.map((s: Service) => (
                            <SelectItem key={s.id} value={s.id}>{s.title} - ${Number(s.price).toLocaleString('es-AR')}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <button 
                    onClick={() => {
                      if (!cartService) return;
                      const sObj = subServicesData.services.find((s: Service) => s.id === cartService);
                      if (sObj) {
                        setSelectedServices(prev => [...prev!, {
                          id: sObj.id,
                          title: sObj.title,
                          price: sObj.price,
                          duration: sObj.duration || "30 min",
                          category_name: catData?.categories?.find((c: Category) => c.id === cartCategory)?.name
                        }]);
                        setCartService("");
                      }
                    }}
                    disabled={!cartService}
                    className="w-full py-2 bg-gold/10 text-gold text-[10px] font-bold uppercase tracking-widest rounded-lg border border-gold/20 hover:bg-gold hover:text-noir transition-all"
                  >
                    Añadir Tratamiento
                  </button>
                </div>

                {/* List of services */}
                <ScrollArea className="h-32 border border-white/5 rounded-xl bg-noir-light/30 p-1">
                  <div className="space-y-1.5">
                    {selectedServices && selectedServices.length > 0 ? (
                      selectedServices.map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                          <div className="text-[11px]">
                            <span className="font-bold text-cream">{s.title}</span>
                            <span className="text-cream/30 mx-2">•</span>
                            <span className="text-cream/60 font-mono">${Number(s.price).toLocaleString('es-AR')}</span>
                          </div>
                          <button onClick={() => setSelectedServices(prev => prev!.filter((_, i) => i !== idx))} className="text-rose/40 hover:text-rose transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-center text-cream/20 py-4 italic">No hay servicios seleccionados</p>
                    )}
                  </div>
                </ScrollArea>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Nueva Fecha</label>
                        <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full bg-noir-light border border-white/10 rounded-xl p-3 [color-scheme:dark]" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Nuevo Horario</label>
                        <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} className="w-full bg-noir-light border border-white/10 rounded-xl p-3 [color-scheme:dark]" />
                    </div>
                </div>

                {/* Total Calc */}
                <div className="flex justify-between items-end border-t border-white/5 pt-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.2em] text-gold/40 font-bold">Total del Turno</label>
                    <p className="text-3xl font-serif font-black text-gold whitespace-nowrap">
                      ${Number(selectedServices?.reduce((acc, s) => acc + Number(s.price), 0) || 0).toLocaleString('es-AR')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                     <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-bold text-cream/40 uppercase tracking-widest">
                       {selectedServices?.length || 0} Servicios
                     </div>
                     <div className="text-xs font-bold text-gold/60">
                       🕒 {(() => {
                         const totalMins = selectedServices?.reduce((acc, s) => acc + parseInt(s.duration || "0"), 0) || 0;
                         return totalMins >= 60 
                           ? `${Math.floor(totalMins/60)}H${totalMins%60 > 0 ? ` ${totalMins%60}M` : ''}`
                           : `${totalMins} MIN`;
                       })()} TOTAL
                     </div>
                  </div>
                </div>
            </div>
            <DialogFooter>
                <button 
                    disabled={updateAppointment.isPending || !selectedServices?.length}
                    onClick={() => updateAppointment.mutate({ 
                        id: selectedAppointmentForEdit!.id,
                        date_time: new Date(`${formDate}T${formTime}`).toISOString(),
                        service_type: selectedServices![0].title + (selectedServices!.length > 1 ? "..." : ""),
                        client_name: formClientName,
                        phone: formPhone,
                        selected_services: selectedServices,
                        total_price: selectedServices?.reduce((acc, s) => acc + Number(s.price), 0),
                        total_duration: selectedServices?.reduce((acc, s) => acc + parseInt(s.duration || "0"), 0)
                    })} 
                    className="w-full py-4 bg-gradient-to-r from-gold to-[#d4af37] text-noir rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-gold/10 hover:-translate-y-0.5 transition-all"
                >
                    {updateAppointment.isPending ? 'Guardando...' : 'Aplicar Cambios en la Cita'}
                </button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Delete Confirmation AlertDialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent className="bg-noir border border-rose/20 text-cream">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-rose font-serif text-xl flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    ¿Confirmar Eliminación?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-cream/40 leading-relaxed">
                    Esta acción es irreversible y eliminará permanentemente el registro seleccionado de la base de datos de KÂLON.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4">
                  <AlertDialogCancel className="bg-transparent border-white/5 text-cream/40 hover:text-cream">Cancelar Operación</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => {
                        if (itemToDelete?.type === 'lead') deleteLead.mutate(itemToDelete.id);
                        if (itemToDelete?.type === 'appointment') deleteAppointment.mutate(itemToDelete.id);
                        if (itemToDelete?.type === 'service') deleteService.mutate(itemToDelete.id);
                    }}
                    className="bg-rose text-white hover:bg-rose/80 font-bold text-[10px] uppercase tracking-widest rounded-xl px-8"
                  >
                        Eliminar Definitivamente
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      {/* 11. Custom Lightbox */}
      {lightboxImage && createPortal(
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-noir/95 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setLightboxImage(null)}
        >
          <button 
            className="absolute top-8 right-8 p-3 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
            onClick={() => setLightboxImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img 
            src={lightboxImage} 
            alt="Expanded" 
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-300 pointer-events-none"
          />
        </div>,
        document.body
      )}
    </div>
  );
}
