import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LogOut, Users, CalendarCheck, TrendingUp, Edit, MessageSquare, Trash2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
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
  chat_history?: { role: string; content: string }[];
}

interface Appointment {
  id: string;
  lead_id?: string;
  client_name?: string;
  phone?: string;
  service_type: string;
  date_time: string;
  status: string;
  created_at: string;
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
  
  // Tab management: prioritizing URL path, then prop
  const currentTab = useMemo(() => {
    if (location.pathname.endsWith('/dashboard/services')) return 'services';
    if (location.pathname.endsWith('/dashboard/appointments')) return 'appointments';
    if (location.pathname.endsWith('/dashboard') || location.pathname === '/dashboard/') return 'dashboard';
    
    // For backwards compatibility or explicit prop
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

  // Delete confirm states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete ] = useState<{ id: string, type: 'lead' | 'appointment' | 'service' } | null>(null);

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to load dashboard');
      return res.json();
    }
  });

  const { data: servData } = useQuery({
    queryKey: ['services-list'], // Separate key to avoid confusion with cat-specific services
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
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
        setIsEditAppointmentModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        toast.success("Cita actualizada");
    }
  });

  const createAppointment = useMutation({
    mutationFn: async ({ lead_id, date_time, service_type }: { lead_id: string, date_time: string, service_type: string }) => {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id, date_time, service_type })
      });
      if (!res.ok) throw new Error('Failed to create appointment');
      return res.json();
    },
    onSuccess: () => {
      setIsNewAppointmentModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success("Turno agendado correctamente");
    }
  });

  const deleteLead = useMutation({
    mutationFn: (id: string) => fetch(`/api/leads?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => {
        setDeleteConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        toast.success("Lead eliminado");
    }
  });

  const deleteAppointment = useMutation({
    mutationFn: (id: string) => fetch(`/api/appointments?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => {
        setDeleteConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        toast.success("Cita eliminada");
    }
  });

  const deleteService = useMutation({
      mutationFn: (id: string) => fetch(`/api/services?id=${id}`, { method: 'DELETE' }),
      onSuccess: () => {
          setDeleteConfirmOpen(false);
          queryClient.invalidateQueries({ queryKey: ['services-list'] });
          toast.success("Servicio eliminado");
      }
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

  if (dashLoading) {
    return (
        <div className="h-full flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Scrollable Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-10">
        <div className="max-w-7xl mx-auto space-y-12 pb-20">
          
          {currentTab === 'dashboard' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {stats.map((s, i) => (
                <div 
                  key={i} 
                  onClick={() => s.path && navigate(s.path)}
                  className={`p-6 rounded-2xl border border-cream/5 bg-noir-light/30 backdrop-blur-sm group hover:border-gold/20 transition-all ${s.path ? 'cursor-pointer hover:bg-noir-light/50' : ''}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg bg-noir-light border border-white/5`}>
                        <s.icon className={`w-5 h-5 ${s.color}`} />
                      </div>
                      <span className="text-[10px] text-cream/30 uppercase tracking-[0.2em] font-bold">{s.label}</span>
                    </div>
                    {s.path && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <TrendingUp className="w-3 h-3 text-gold/40" />
                      </div>
                    )}
                  </div>
                  <p className="text-4xl font-serif font-bold group-hover:text-gold transition-colors">{s.value}</p>
                </div>
              ))}
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
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Cliente / Teléfono</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Tratamiento</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Fecha y Hora</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAppointments.map((a, i) => (
                        <TableRow key={a.id} className={`border-b border-cream/5 hover:bg-cream/[0.02] transition-colors group animate-in fade-in slide-in-from-bottom-2`} style={{ animationDelay: `${i * 50}ms` }}>
                          <TableCell className="px-6 py-4">
                            <div className="font-serif font-bold text-cream">{a.client_name}</div>
                            <div className="text-[10px] text-cream/20 font-sans">{a.phone || "Sin teléfono"}</div>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <Badge variant="outline" className="text-gold/60 border-gold/20 bg-gold/5 font-serif">{a.service_type}</Badge>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <div className="text-sm font-sans text-cream/60">
                                {new Date(a.date_time).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
                            </div>
                            <div className="text-xs font-bold text-cream/20">
                                {new Date(a.date_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} HS
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                className="p-2 rounded-lg bg-cream/5 text-cream/40 hover:text-gold transition-colors"
                              ><Edit className="w-4 h-4" /></button>
                              <button 
                                onClick={() => { setItemToDelete({ id: a.id, type: 'appointment' }); setDeleteConfirmOpen(true); }} 
                                className="p-2 rounded-lg bg-cream/5 text-cream/40 hover:text-rose transition-colors"
                              ><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredAppointments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="h-32 text-center text-cream/10 italic font-serif">
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
                      <TableRow className="border-b border-cream/5 hover:bg-transparent">
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Nombre</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">I.A. Bot</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Score</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((l, i) => (
                        <TableRow key={l.id} className="border-b border-cream/5 hover:bg-cream/[0.02] group transition-colors animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 50}ms` }}>
                          <TableCell className="px-6 py-4">
                            <div className="font-serif font-bold text-cream underline decoration-gold/20 underline-offset-4">{l.client_name}</div>
                            <div className="text-[10px] text-cream/20 mt-0.5">{new Date(l.created_at).toLocaleDateString()}</div>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                              <button 
                                  onClick={() => toggleBotMutation.mutate({ leadId: l.id, isBotEnabled: !l.is_bot_enabled })}
                                  className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm ${
                                    l.is_bot_enabled 
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' 
                                      : 'bg-rose/10 text-rose border border-rose/20 hover:bg-rose/20'
                                  }`}
                              >
                                  {l.is_bot_enabled ? 'Activado' : 'Pausado'}
                              </button>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-400" style={{ width: `${l.intent_score}%` }} />
                                </div>
                                <span className="text-[10px] font-bold text-emerald-400/60">{l.intent_score}%</span>
                              </div>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => { setSelectedLeadForChat(l); setIsChatModalOpen(true); }} 
                                className="p-2 rounded-lg bg-gold/10 text-gold hover:bg-gold hover:text-noir transition-all border border-gold/20"
                                title="Ver Historial de IA"
                              ><MessageSquare className="w-4 h-4" /></button>
                              <button 
                                onClick={() => { setSelectedLeadForAppt(l); setIsNewAppointmentModalOpen(true); }} 
                                className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-noir transition-all border border-emerald-500/20"
                                title="Agendar Cita"
                              ><CalendarCheck className="w-4 h-4" /></button>
                              <button 
                                onClick={() => { setItemToDelete({ id: l.id, type: 'lead' }); setDeleteConfirmOpen(true); }} 
                                className="p-2 rounded-lg bg-rose/10 text-rose hover:bg-rose hover:text-white transition-all border border-rose/20"
                                title="Eliminar Lead"
                              ><Trash2 className="w-4 h-4" /></button>
                            </div>
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
                  className="w-full py-3 bg-noir-light border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
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
                        createAppointment.mutate({ lead_id: selectedLeadForAppt!.id, date_time: `${formDate}T${formTime}:00Z`, service_type: formService });
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
