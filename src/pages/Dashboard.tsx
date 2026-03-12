import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  LogOut, Users, CalendarCheck, TrendingUp, Edit, MessageSquare, 
  Trash2, CheckCircle2, XCircle, AlertTriangle, Clock, 
  ArrowRight, ShieldAlert, Zap, Bell, CalendarDays, ChevronRight, 
  Phone, MoreHorizontal 
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthContext";
import { toast } from "sonner";
import ServicesManagement from "@/components/dashboard/ServicesManagement";
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
  chat_history?: { role: string; content: string }[];
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

  // Form states
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formService, setFormService] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formClientName, setFormClientName] = useState("");

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

  const services: Service[] = useMemo(() => servData?.services || [], [servData?.services]);

  const updateAppointment = useMutation({
    mutationFn: async ({ id, status, date_time, service_type, client_name, phone }: { id: string, status?: string, date_time?: string, service_type?: string, client_name?: string, phone?: string }) => {
      const res = await fetch(`/api/appointments?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, date_time, service_type, client_name, phone })
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
    mutationFn: async ({ lead_id, date_time, service_type, category_id }: { lead_id: string, date_time: string, service_type: string, category_id?: string }) => {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id, date_time, service_type, category_id })
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
    mutationFn: (id: string) => fetch(`/api/leads?id=${id}`, { method: 'DELETE' }),
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
    onError: (err) => toast.error(err.message)
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
      const res = await fetch('/api/leads/toggle-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, isBotEnabled })
      });
      if (!res.ok) throw new Error('Failed to toggle bot');
      return res.json();
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        toast.info("Estado del bot actualizado");
    }
  });

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
    { icon: CalendarCheck, label: "Turnos", value: appointments.length, color: "text-amber-400" },
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
        <div className="max-w-7xl mx-auto space-y-12 pb-20">
          
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
                              <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                  <Clock className={`w-3.5 h-3.5 ${appt.canManage ? 'text-gold' : 'text-cream/20'}`} />
                                  <span className={`text-sm font-bold font-sans ${appt.canManage ? 'text-gold' : 'text-cream/40'}`}>
                                    {new Date(appt.date_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} HS
                                  </span>
                                </div>
                                <h4 className={`text-lg font-serif font-bold ${appt.canManage ? 'text-cream' : 'text-cream/30'}`}>
                                  {appt.canManage ? appt.client_name : `Ocupado — ${appt.category_name}`}
                                </h4>
                                {appt.canManage && (
                                  <div className="flex items-center gap-4 mt-2">
                                     <span className="text-xs text-cream/40 px-2 py-0.5 rounded bg-noir border border-white/5">{appt.service_type}</span>
                                     <span className="text-xs text-gold font-sans font-medium">{appt.phone}</span>
                                  </div>
                                )}
                              </div>
                              
                              {appt.canManage && (
                                <button 
                                  onClick={() => {
                                    setSelectedAppointmentForEdit(appt);
                                    setFormDate(new Date(appt.date_time).toISOString().split('T')[0]);
                                    setFormTime(new Date(appt.date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
                                    setFormService(appt.service_type);
                                    setFormClientName(appt.client_name || "");
                                    setFormPhone(appt.phone || "");
                                    setIsEditAppointmentModalOpen(true);
                                  }}
                                  className="p-3 rounded-xl bg-gold text-noir hover:scale-110 active:scale-95 transition-all shadow-lg shadow-gold/10"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
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
                                   {Math.max(0, Math.floor((new Date(upNext.date_time).getTime() - new Date().getTime()) / (1000 * 60)))} min
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
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Cliente</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Contacto</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Servicio</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Fecha y Hora</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Estado</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAppointments.map((a, i) => (
                        <TableRow key={a.id} className={`border-b border-cream/5 hover:bg-cream/[0.02] transition-colors group animate-in fade-in slide-in-from-bottom-2 ${!a.canManage ? 'opacity-40 grayscale-[0.5]' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
                          <TableCell className="px-6 py-6">
                            <div className="font-serif font-bold text-lg text-cream tracking-tight">
                              {a.canManage ? a.client_name : `Ocupado - ${a.category_name}`}
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-6">
                            {a.canManage && a.phone && (
                              <a 
                                href={`https://wa.me/${a.phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-bold font-mono hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all group/wa"
                              >
                                <Phone className="w-3 h-3 group-hover/wa:scale-110 transition-transform" />
                                {a.phone}
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="px-6 py-6">
                            <div className="flex items-center gap-2.5 text-sm font-serif text-cream/80 group-hover:text-cream transition-colors">
                              <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(194,154,91,0.4)] ${a.canManage ? 'bg-gold' : 'bg-white/10'}`} />
                              {a.service_type}
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-6 font-sans">
                            <div className="text-sm font-medium text-cream/60 capitalize">
                              {new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(a.date_time))}
                              <span className="mx-2 text-cream/10">•</span>
                              <span className="text-gold font-bold">
                                {new Date(a.date_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}hs
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-6">
                            <Badge 
                              variant="outline" 
                              className={`
                                text-[9px] font-black tracking-[0.15em] px-3 py-1 rounded-full border shadow-sm
                                ${a.status === 'scheduled' 
                                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' 
                                  : 'border-gold/30 bg-gold/5 text-gold'}
                              `}
                            >
                              {a.status === 'scheduled' ? 'CONFIRMADA' : 'PENDIENTE'}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-6 py-6 text-right">
                            {a.canManage && (
                              <div className="flex justify-end gap-2.5">
                                <button 
                                  onClick={() => {
                                    setSelectedAppointmentForEdit(a);
                                    setFormDate(new Date(a.date_time).toISOString().split('T')[0]);
                                    setFormTime(new Date(a.date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
                                    setFormService(a.service_type);
                                    setFormClientName(a.client_name || "");
                                    setFormPhone(a.phone || "");
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
                                    <DropdownMenuItem className="focus:bg-gold/10 focus:text-gold cursor-pointer" onClick={() => updateAppointment.mutate({ id: a.id, status: 'completed' })}>
                                      <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como Realizado
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
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Prospecto</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Contacto</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12 text-center">Intención AI</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((l, i) => (
                        <TableRow key={l.id} className={`border-b border-cream/5 hover:bg-cream/[0.02] group transition-colors animate-in fade-in slide-in-from-bottom-2 ${!l.canManage ? 'opacity-40' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
                          <TableCell className="px-6 py-5">
                            <div className="font-serif font-bold text-cream text-base tracking-tight">{l.canManage ? l.client_name : `Interesado - ${l.category_name}`}</div>
                          </TableCell>
                          <TableCell className="px-6 py-5">
                            {l.phone && (
                              <a 
                                href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-[10px] font-bold font-mono hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all group/wa"
                              >
                                <Phone className="w-3 h-3 group-hover/wa:scale-110 transition-transform" />
                                {l.phone}
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="px-6 py-5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className={`text-[10px] font-black tracking-widest mb-1 ${l.intent_score > 70 ? 'text-gold' : 'text-cream/40'}`}>
                                {l.intent_score}%
                              </span>
                              <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-gold h-full shadow-[0_0_8px_rgba(194,154,91,0.5)] transition-all duration-1000" 
                                  style={{ width: `${l.intent_score}%` }} 
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-right">
                            {l.canManage && (
                              <div className="flex justify-end gap-2.5">
                                <button 
                                  onClick={() => { setSelectedLeadForChat(l); setIsChatModalOpen(true); }}
                                  className="p-2 rounded-lg bg-gold/5 text-gold/60 hover:text-gold hover:bg-gold/10 transition-all border border-transparent hover:border-gold/20"
                                  title="Abrir Chat"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => { setSelectedLeadForAppt(l); setIsNewAppointmentModalOpen(true); }}
                                  className="p-2 rounded-lg bg-emerald-500/5 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all border border-transparent hover:border-emerald-500/20"
                                  title="Agendar Cita"
                                >
                                  <CalendarCheck className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => { setItemToDelete({ id: l.id, type: 'lead' }); setDeleteConfirmOpen(true); }} 
                                  className="p-2 rounded-lg bg-rose/5 text-rose/60 hover:text-rose hover:bg-rose/10 transition-all border border-transparent hover:border-rose/20"
                                  title="Eliminar Lead"
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
                                    <DropdownMenuItem className="focus:bg-emerald-500/10 focus:text-emerald-400 cursor-pointer" onClick={() => toggleBotMutation.mutate({ leadId: l.id, isBotEnabled: !l.is_bot_enabled })}>
                                      <Zap className="w-4 h-4 mr-2" /> {l.is_bot_enabled ? 'Pausar Bot' : 'Activar Bot'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-white/5" />
                                    <DropdownMenuItem className="focus:bg-gold/10 focus:text-gold cursor-pointer" onClick={() => window.open(`https://wa.me/${l.phone?.replace(/\D/g, '')}`, '_blank')}>
                                      <MessageSquare className="w-4 h-4 mr-2" /> Escribir por WhatsApp
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
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
        <DialogContent className="bg-noir border border-gold/20 text-cream max-w-lg">
            <DialogHeader>
                <DialogTitle className="font-serif text-xl flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-gold" />
                    Inteligencia Artificial: {selectedLeadForChat?.client_name}
                </DialogTitle>
                <DialogDescription className="text-cream/30">Historial completo de la conversación automatizada</DialogDescription>
            </DialogHeader>
            <div className="h-[450px] overflow-y-auto space-y-4 p-4 bg-noir-light/30 rounded-2xl border border-white/5 custom-scrollbar">
                {selectedLeadForChat?.chat_history && selectedLeadForChat.chat_history.length > 0 ? (
                    selectedLeadForChat.chat_history.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                                m.role === 'user' 
                                  ? 'bg-white/5 text-cream/70 rounded-tr-sm border border-white/10' 
                                  : 'bg-gold/10 text-gold rounded-tl-sm border border-gold/20'
                            }`}>
                                <p className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-1">{m.role === 'user' ? 'Cliente' : 'Aura I.A.'}</p>
                                {m.content}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 italic">
                        <MessageSquare className="w-12 h-12 mb-2" />
                        <p>No hay mensajes registrados aún.</p>
                    </div>
                )}
            </div>
            <DialogFooter>
                <button 
                  onClick={() => setIsChatModalOpen(false)} 
                  className="w-full py-3 bg-noir-light border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-colors text-gold"
                >Cerrar Ventana</button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. New Appointment Modal */}
      <Dialog open={isNewAppointmentModalOpen} onOpenChange={setIsNewAppointmentModalOpen}>
        <DialogContent className="bg-noir border border-gold/20 text-cream">
            <DialogHeader>
                <DialogTitle className="font-serif text-xl">Agendar Cita Manual</DialogTitle>
                <DialogDescription>Convierte este lead en un turno confirmado</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
                <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Seleccionar Tratamiento</label>
                    <select 
                      value={formService} 
                      onChange={e => setFormService(e.target.value)} 
                      className="w-full bg-noir-light border border-white/10 rounded-xl p-3 outline-none focus:border-gold transition-colors appearance-none cursor-pointer"
                    >
                        <option value="">Elegir servicio...</option>
                        {services.map(s => <option key={s.id} value={s.title}>{s.title}</option>)}
                    </select>
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
            </div>
            <DialogFooter>
                <button onClick={() => setIsNewAppointmentModalOpen(false)} className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest opacity-20 hover:opacity-100 transition-opacity">Cancelar</button>
                <button 
                    disabled={createAppointment.isPending}
                    onClick={() => {
                        if (!formService || !formDate || !formTime) {
                            toast.error("Por favor completa todos los campos");
                            return;
                        }
                        const serviceRes = services.find(s => s.title === formService);
                        createAppointment.mutate({ 
                          lead_id: selectedLeadForAppt!.id, 
                          date_time: `${formDate}T${formTime}:00Z`, 
                          service_type: formService,
                          category_id: serviceRes?.category_id || ""
                        });
                    }} 
                    className="px-8 py-3 bg-gold text-noir rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-gold/20"
                >
                    {createAppointment.isPending ? 'Procesando...' : 'Confirmar y Agendar'}
                </button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Edit Appointment Modal */}
      <Dialog open={isEditAppointmentModalOpen} onOpenChange={setIsEditAppointmentModalOpen}>
        <DialogContent className="bg-noir border border-gold/20 text-cream">
            <DialogHeader>
                <DialogTitle className="font-serif text-xl border-l-4 border-gold pl-3">Redefinir Cita</DialogTitle>
                <DialogDescription>Modifica los detalles del turno programado</DialogDescription>
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
                <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Tratamiento Asignado</label>
                    <select value={formService} onChange={e => setFormService(e.target.value)} className="w-full bg-noir-light border border-white/10 rounded-xl p-3">
                        {services.map(s => <option key={s.id} value={s.title}>{s.title}</option>)}
                    </select>
                </div>
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
            </div>
            <DialogFooter>
                <button 
                    disabled={updateAppointment.isPending}
                    onClick={() => updateAppointment.mutate({ 
                        id: selectedAppointmentForEdit!.id,
                        date_time: `${formDate}T${formTime}:00Z`,
                        service_type: formService,
                        client_name: formClientName,
                        phone: formPhone
                    })} 
                    className="w-full py-3.5 bg-gradient-to-r from-gold to-[#d4af37] text-noir rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-gold/10 hover:-translate-y-0.5 transition-all"
                >
                    {updateAppointment.isPending ? 'Guardando...' : 'Aplicar Cambios'}
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

    </div>
  );
}
