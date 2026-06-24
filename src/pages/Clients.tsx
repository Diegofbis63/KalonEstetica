import React, { useState } from 'react';
import { useAuth } from "@/components/AuthContext";
import { maskPhone } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Users, 
  Search, 
  Filter, 
  ChevronRight, 
  Phone, 
  Mail, 
  Calendar, 
  History,
  ArrowUpDown,
  ExternalLink,
  MoreVertical,
  Activity,
  Edit,
  Save,
  Trash2, 
  X,
  MessageSquare,
  Clock,
  Plus,
  Send,
  Paperclip,
  CalendarDays,
  Image as LucideImage
} from 'lucide-react';
import { toast } from 'sonner';
import { useChat } from "@/context/ChatContext";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button"; // Removed to avoid ReferenceError in production
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { 
  safeFetch, 
  ClientsResponseSchema,
  Client,
  Lead
} from "@/lib/validations";

export default function Clients() {
  const { user: authUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'new' | 'recurrent' | 'vip'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 20;


  const { openChat } = useChat();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNote, setEditNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ['clients-list', currentPage, searchTerm, filterType, filterStatus],
    queryFn: () => safeFetch(`/api/clients?limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`, ClientsResponseSchema, { clients: [] }),
    refetchInterval: 60000,
  });


  const updateClient = useMutation({
    mutationFn: async (clientData: { client_name: string; phone: string; email: string; note: string }) => {
      const res = await fetch(`/api/clients?id=${selectedClient?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al actualizar');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      setSelectedClient(data.client);
      setIsEditing(false);
      toast.success("Cliente actualizado correctamente");
    },
    onError: (err: Error) => toast.error(err.message)
  });
  
  const toggleBotMutation = useMutation({
    mutationFn: async ({ leadId, isBotEnabled }: { leadId: string, isBotEnabled: boolean }) => {
      const res = await fetch(`/api/leads/chat?leadId=${leadId}&action=toggle-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBotEnabled })
      });
      if (!res.ok) throw new Error('Error al cambiar estado del bot');
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all related queries to keep UI synchronized
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['income'] });
      queryClient.invalidateQueries({ queryKey: ['chat'] });
      toast.info("Estado del BOT actualizado");
    }
  });

  const handleEditInit = (client: Client) => {
    setSelectedClient(client);
    setEditName(client.client_name);
    setEditPhone(client.phone || "");
    setEditEmail(client.email || "");
    setEditNote(client.note || "");
    setIsEditing(false);
  };

  const clients: Client[] = data?.clients || [];

  const filteredClients = (clients || []).filter(c => {
    const matchesSearch = (c.client_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.phone && c.phone.includes(searchTerm));

    let matchesType = true;
    if (filterType === 'new') matchesType = Number(c.total_appointments) === 1;
    else if (filterType === 'recurrent') matchesType = Number(c.total_appointments) > 1 && Number(c.total_appointments) <= 5;
    else if (filterType === 'vip') matchesType = Number(c.total_appointments) > 5;

    let matchesStatus = true;
    const daysSinceLast = Math.floor((new Date().getTime() - new Date(c.last_appointment).getTime()) / (1000 * 60 * 60 * 24));
    if (filterStatus === 'active') matchesStatus = daysSinceLast <= 30;
    else if (filterStatus === 'inactive') matchesStatus = daysSinceLast > 30;

    let matchesCompleted = true;
    if (!showCompleted) {
        const total = Number(c.total_appointments || 0);
        const pending = Number((c as any).pending_appointments || 0);
        if (total > 0 && pending === 0) {
            matchesCompleted = false;
        }
    }

    return matchesSearch && matchesType && matchesStatus && matchesCompleted;
  });

  const clearFilters = () => {
    setFilterType('all');
    setFilterStatus('all');
    setSearchTerm("");
  };

  const hasActiveFilters = filterType !== 'all' || filterStatus !== 'all' || searchTerm !== "";

  const renderClientDetail = (client: Client) => (
    <div className="h-full flex flex-col pt-8 px-6 sm:px-8">
      <SheetHeader className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gold/5 border border-gold/10 flex items-center justify-center text-gold font-bold text-xl sm:text-2xl shadow-xl">
              {(isEditing ? editName : client.client_name).split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="text-left">
              {isEditing ? (
                <SheetTitle className="text-xl sm:text-2xl font-serif text-cream">Editando Perfil</SheetTitle>
              ) : (
                <SheetTitle className="text-xl sm:text-2xl font-serif text-cream">{client.client_name || 'Cliente Sin Nombre'}</SheetTitle>
              )}
              <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
                <Badge className="bg-gold/10 text-gold border-gold/20 text-[9px] sm:text-[10px]">
                  {(client.total_appointments ?? 0) > 5 ? 'CLIENTE VIP' : 'CLIENTE REGULAR'}
                </Badge>
                <span className="text-[9px] sm:text-[10px] text-cream/20 uppercase tracking-widest font-black">ID: {client.id?.slice(0,8) ?? 'N/A'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {authUser?.role === 'admin' && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border transition-all ${isEditing ? 'border-rose-500/20 text-rose-400 bg-rose-500/5' : 'border-white/5 text-cream/40 hover:text-gold hover:bg-gold/10 hover:border-gold/20'}`}
              >
                {isEditing ? <X className="w-4 h-4 sm:w-5 sm:h-5" /> : <Edit className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            )}
            <SheetClose asChild>
              <button className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-white/5 text-cream/40 hover:text-gold hover:bg-gold/10 hover:border-gold/20 transition-all" aria-label="Cerrar panel">
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </SheetClose>
          </div>
        </div>
      </SheetHeader>

      {isEditing ? (
        <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="space-y-3 sm:space-y-4 bg-white/[0.02] border border-white/5 p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-inner">
            <div className="space-y-1.5">
              <Label className="text-[9px] sm:text-[10px] uppercase tracking-widest text-cream/30 font-black">Nombre Completo</Label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="bg-noir border-white/5 focus:border-gold/30 h-11 sm:h-14 rounded-xl text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] sm:text-[10px] uppercase tracking-widest text-cream/30 font-black">WhatsApp / Tel</Label>
                <Input
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  className="bg-noir border-white/5 focus:border-gold/30 h-11 sm:h-14 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] sm:text-[10px] uppercase tracking-widest text-cream/30 font-black">Email</Label>
                <Input
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="bg-noir border-white/5 focus:border-gold/30 h-11 sm:h-14 rounded-xl text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] sm:text-[10px] uppercase tracking-widest text-cream/30 font-black">Notas Internas</Label>
              <Textarea
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                className="bg-noir border-white/5 focus:border-gold/30 min-h-[80px] sm:min-h-[120px] resize-none rounded-xl p-3 text-sm"
                placeholder="Ej: Prefiere turnos por la tarde, alergia a ciertos productos..."
              />
            </div>
          </div>

          <button
            className="w-full bg-gold text-noir font-black h-12 sm:h-16 rounded-xl sm:rounded-[1.5rem] tracking-[0.2em] text-xs sm:text-sm shadow-xl shadow-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
            onClick={() => updateClient.mutate({ client_name: editName, phone: editPhone, email: editEmail, note: editNote })}
            disabled={updateClient.isPending || !editName || !editPhone}
          >
            {updateClient.isPending ? (
              <History className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                CONFIRMAR CAMBIOS
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="p-6 rounded-[1.5rem] bg-gradient-to-br from-gold/10 to-transparent border border-gold/10 group">
              <p className="text-[10px] text-gold font-black uppercase tracking-[0.2em] mb-2 px-1">Total Visitas</p>
              <p className="text-4xl font-serif font-black text-cream tracking-tighter">{client.total_appointments ?? 0}</p>
            </div>
            <div className="p-6 rounded-[1.5rem] bg-white/[0.03] border border-white/5">
              <p className="text-[10px] text-cream/30 font-black uppercase tracking-[0.2em] mb-2">Última Visita</p>
              <p className="text-xl font-serif font-bold text-cream">
                {client.last_appointment ? Math.floor((new Date().getTime() - new Date(client.last_appointment).getTime()) / (1000 * 60 * 60 * 24)) : '-'} días ago
              </p>
            </div>
          </div>

          <div className="space-y-8 flex-1">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-cream/60 uppercase tracking-widest flex items-center gap-3 italic">
                  <History className="w-4 h-4 text-gold/60" />
                  Línea de Tiempo del Cliente
                </h3>
                <div className="h-[2px] flex-1 bg-white/5 ml-4" />
              </div>
              <ScrollArea className="h-[450px] pr-6">
                <div className="space-y-4">
                  {client.appointment_history?.map((appt, idx) => (
                    <div key={appt.id || idx} className="relative pl-8 pb-8 border-l border-white/10 last:pb-0 group/time">
                      <div className="absolute left-[-5px] top-2 w-2.5 h-2.5 rounded-full bg-gold/40 shadow-gold/20 shadow-lg group-hover/time:scale-150 group-hover/time:bg-gold transition-all" />
                      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 group-hover/time:bg-white/[0.04] group-hover/time:border-gold/20 transition-all shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <p className="font-serif font-bold text-cream text-xl tracking-tight">{appt.service_type || 'Servicio General'}</p>
                          <Badge variant="outline" className={`text-[9px] font-black tracking-widest px-3 h-6 rounded-full border-none shadow-inner ${
                            appt.status?.toLowerCase() === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                            appt.status?.toLowerCase() === 'canceled' ? 'bg-rose-500/10 text-rose-400' :
                            'bg-gold/10 text-gold shadow-gold/20'
                          }`}>
                            {(appt.status || 'PENDIENTE').toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-medium text-cream/40">
                          <div className="flex items-center gap-1.5 bg-white/5 py-1 px-2.5 rounded-lg border border-white/5">
                            <Calendar className="w-3.5 h-3.5 text-gold/60" />
                            {appt.date_time ? new Date(appt.date_time).toLocaleDateString('es-AR', { day: '2-digit', month: 'long' }) : 'N/A'}
                          </div>
                          <div className="flex items-center gap-1.5 bg-white/5 py-1 px-2.5 rounded-lg border border-white/5">
                            <Clock className="w-3.5 h-3.5" />
                            {appt.date_time ? new Date(appt.date_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}hs
                          </div>
                        </div>
                      </div>
                    </div>
                  )) || (
                    <div className="flex flex-col items-center justify-center py-20 opacity-20 text-center">
                      <CalendarDays className="w-12 h-12 mb-4" />
                      <p className="font-serif italic text-lg">Sin historial de turnos</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="mt-auto pt-8 border-t border-white/5 flex gap-3">
            <button
              onClick={() => {
                const leadObj: Lead = {
                  id: client.id as string,
                  client_name: client.client_name,
                  phone: client.phone ?? undefined
                };
                openChat(leadObj);
              }}
              className="flex-1 bg-[#25D366] hover:bg-[#128C7E] text-white font-black text-[10px] tracking-[0.2em] h-16 rounded-[1.25rem] shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 transition-all active:scale-95"
            >
              <Phone className="w-5 h-5" />
              ENVIAR WHATSAPP
            </button>
            <button
              className="w-16 h-16 rounded-[1.25rem] border border-white/5 bg-white/5 text-cream/40 flex items-center justify-center hover:text-white transition-all active:scale-95"
              onClick={() => toast.info("Funcionalidad próximamente")}
            >
              <Paperclip className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-gold flex items-center gap-3">
            <Users className="w-8 h-8" />
            Base de Clientes
          </h1>
          <p className="text-cream/40 mt-1 font-sans">Gestión y seguimiento de clientes registrados en KÂLON.</p>
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="relative group flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/20 group-focus-within:text-gold transition-colors" />
            <Input
              placeholder="Buscar por nombre o teléfono..."
              className="pl-10 bg-noir border-cream/5 focus:border-gold/30 text-cream w-full transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/10 shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-widest text-cream/60">Mostrar Realizados</span>
            <Switch 
              checked={showCompleted} 
              onCheckedChange={setShowCompleted}
              className="data-[state=checked]:bg-gold"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition-all ${
                  (filterType !== 'all' || filterStatus !== 'all') 
                    ? 'border-gold bg-gold/5 text-gold' 
                    : 'border-white/5 bg-noir text-cream/60 hover:bg-white/5'
                }`}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filtros
                {(filterType !== 'all' || filterStatus !== 'all') && (
                  <Badge className="ml-2 bg-gold text-noir text-[8px] h-4 w-4 p-0 flex items-center justify-center rounded-full">
                    !
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-noir-light border-white/5 text-cream w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-cream/30">Nivel de Cliente</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={filterType === 'all'} onCheckedChange={() => setFilterType('all')}>
                Todos los niveles
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterType === 'new'} onCheckedChange={() => setFilterType('new')}>
                Nuevos (1 visita)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterType === 'recurrent'} onCheckedChange={() => setFilterType('recurrent')}>
                Recurrentes (2-5)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterType === 'vip'} onCheckedChange={() => setFilterType('vip')}>
                V.I.P. (+5 visitas)
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator className="bg-white/5" />

              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-cream/30">Estado de Actividad</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={filterStatus === 'all'} onCheckedChange={() => setFilterStatus('all')}>
                Cualquier estado
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterStatus === 'active'} onCheckedChange={() => setFilterStatus('active')}>
                Activos (últ. 30 días)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterStatus === 'inactive'} onCheckedChange={() => setFilterStatus('inactive')}>
                Inactivos (+30 días)
              </DropdownMenuCheckboxItem>

              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator className="bg-white/5" />
                  <button
                    className="w-full text-[10px] h-10 text-rose-400 hover:bg-rose-500/10 transition-colors uppercase font-black flex items-center justify-center gap-2"
                    onClick={clearFilters}
                  >
                    <X className="w-3 h-3" /> Limpiar Filtros
                  </button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-noir/20 border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl relative">
        {/* Mobile View: High Fidelity Cards */}
        <div className="md:hidden divide-y divide-white/5">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-6 animate-pulse space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5" />
                  <div className="space-y-2 flex-1">
                    <div className="w-32 h-4 bg-white/5 rounded" />
                    <div className="w-20 h-3 bg-white/5 rounded" />
                  </div>
                </div>
              </div>
            ))
          ) : filteredClients.map((client) => (
            <div key={client.id} className="p-6 space-y-5 bg-noir/20">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gold/5 border border-gold/10 flex items-center justify-center text-gold font-bold text-sm shadow-inner">
                    {client.client_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-serif font-bold text-cream text-lg">{client.client_name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="bg-gold/10 text-gold border-gold/20 text-[9px] h-5 px-2">
                        {client.total_appointments} {client.total_appointments === 1 ? 'VISITA' : 'VISITAS'}
                      </Badge>
                      <span className="text-[10px] text-cream/20 font-black">•</span>
                      <span className="text-[10px] text-cream/40 font-mono tracking-tighter uppercase">ACTIVO</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-center justify-center gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5">
                  <Switch 
                    disabled={authUser?.role === 'staff'}
                    checked={client.is_bot_enabled} 
                    onCheckedChange={(val) => toggleBotMutation.mutate({ leadId: client.id, isBotEnabled: val })}
                    className="data-[state=checked]:bg-gold scale-75"
                  />
                  <span className={`text-[8px] font-black tracking-widest ${client.is_bot_enabled ? 'text-emerald-400' : 'text-cream/20'}`}>
                    BOT
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    const leadObj: Lead = {
                      id: client.id as string,
                      client_name: client.client_name,
                      phone: client.phone ?? undefined
                    };
                    openChat(leadObj);
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-emerald-500/20 transition-all group"
                >
                  <Phone className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-black uppercase text-cream/40 group-hover:text-cream transition-colors tracking-widest">WhatsApp</span>
                </button>

                <Sheet>
                  <SheetTrigger asChild>
                    <button
                      onClick={() => handleEditInit(client)}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-gold/20 transition-all group"
                    >
                      <History className="w-5 h-5 text-gold group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-black uppercase text-cream/40 group-hover:text-cream transition-colors tracking-widest">Historial</span>
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="bg-noir-light border-l border-white/5 text-cream w-full sm:w-[540px] p-0 overflow-y-auto">
                     {selectedClient && renderClientDetail(selectedClient)}
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader className="bg-white/5">
            <TableRow className="border-cream/5 hover:bg-transparent">
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4 pl-8">Cliente</TableHead>
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4 hidden md:table-cell">Contacto</TableHead>
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4 text-center hidden lg:table-cell">BOT</TableHead>
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4 hidden sm:table-cell">Frecuencia</TableHead>
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4 hidden md:table-cell">Última Cita</TableHead>
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4 text-right pr-8">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="animate-pulse border-cream/5">
                  <TableCell colSpan={6} className="py-12 bg-white/[0.02]" />
                </TableRow>
              ))
            ) : filteredClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-24 text-center">
                  <div className="flex flex-col items-center gap-3 opacity-20">
                    <Users className="w-12 h-12" />
                    <p className="font-serif italic">No se encontraron clientes</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredClients.map((client) => (
                <TableRow key={client.id} className="group border-cream/5 hover:bg-white/[0.02] transition-colors">
                  <TableCell className="py-8 pl-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gold/5 border border-gold/10 flex items-center justify-center text-gold font-bold text-sm shadow-inner group-hover:scale-110 transition-transform">
                        {client.client_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-bold text-cream group-hover:text-gold transition-colors">{client.client_name}</p>
                        {client.note && <p className="text-[11px] text-cream/30 italic truncate max-w-[150px]">{client.note}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-8 hidden md:table-cell">
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          const leadObj: Lead = {
                            id: client.id as string,
                            client_name: client.client_name,
                            phone: client.phone ?? undefined
                          };
                          openChat(leadObj);
                        }}
                        className="flex items-center gap-2 text-sm text-cream/60 hover:text-emerald-400 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span className={authUser?.role !== 'admin' ? 'select-none' : ''}>
                          {maskPhone(client.phone, authUser?.role)}
                        </span>
                      </button>
                      {client.email && (
                        <div className="flex items-center gap-2 text-[11px] text-cream/30">
                          <Mail className="w-3.5 h-3.5" />
                          {client.email}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-8 text-center hidden lg:table-cell">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Switch 
                        disabled={authUser?.role === 'staff'}
                        checked={client.is_bot_enabled} 
                        onCheckedChange={(val) => toggleBotMutation.mutate({ leadId: client.id, isBotEnabled: val })}
                        className="data-[state=checked]:bg-gold scale-75"
                      />
                      <span className={`text-[8px] font-black tracking-widest ${client.is_bot_enabled ? 'text-emerald-400' : 'text-cream/20'}`}>
                        {client.is_bot_enabled ? 'BOT ON' : 'BOT OFF'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-8 hidden sm:table-cell">
                    <Badge variant="outline" className="bg-gold/5 border-gold/20 text-gold text-[10px] font-bold px-2 py-0.5 shadow-sm">
                      {client.total_appointments} {client.total_appointments === 1 ? 'VISITA' : 'VISITAS'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-8 hidden md:table-cell">
                    <div className="flex items-center gap-2 text-sm text-cream/60 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-gold/40" />
                      {new Date(client.last_appointment).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </TableCell>
                  <TableCell className="py-8 text-right pr-8">
                    <Sheet>
                      <SheetTrigger asChild>
                        <button
                          className="bg-transparent text-gold hover:text-gold-light font-black text-[10px] tracking-widest uppercase flex items-center gap-2 ml-auto group/btn transition-all"
                          onClick={() => handleEditInit(client)}
                        >
                          DETALLES
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                      </SheetTrigger>
                      <SheetContent side="right" className="bg-noir-light border-l border-white/5 text-cream w-full sm:w-[540px] p-0 overflow-y-auto">
                        {selectedClient && renderClientDetail(selectedClient)}
                      </SheetContent>
                    </Sheet>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
        
        {/* Pagination Controls */}
        <div className="px-8 py-6 bg-white/[0.02] border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] text-cream/30 uppercase tracking-[0.25em] font-black">
            Total Registros: <span className="text-gold">{data?.metadata?.total || 0}</span> Clientes
          </p>
          <div className="flex items-center gap-3">
            <button
              disabled={currentPage === 0 || isLoading}
              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
              className="h-12 px-6 rounded-xl bg-noir border border-white/5 text-[10px] font-black uppercase tracking-widest text-cream/40 hover:text-gold hover:border-gold/30 disabled:opacity-30 transition-all flex items-center gap-2"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Anterior
            </button>
            <div className="h-12 w-12 flex items-center justify-center bg-gold/5 rounded-xl border border-gold/10">
              <span className="text-xs font-black text-gold">{currentPage + 1}</span>
            </div>
            <button
              disabled={!data?.metadata?.hasMore || isLoading}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="h-12 px-6 rounded-xl bg-noir border border-white/5 text-[10px] font-black uppercase tracking-widest text-cream/40 hover:text-gold hover:border-gold/30 disabled:opacity-30 transition-all flex items-center gap-2"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-gold/5 border border-gold/10 p-6 rounded-3xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gold/10 flex items-center justify-center text-gold">
          <Activity className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-bold text-gold uppercase tracking-widest">Base de Datos Inteligente</p>
          <p className="text-xs text-cream/40">Los clientes se sincronizan automáticamente cada vez que se agenda o completa un turno en el sistema.</p>
        </div>
      </div>
    </div>
  );
}
