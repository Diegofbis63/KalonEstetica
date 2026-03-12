import React, { useState } from 'react';
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
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Client {
  id: string;
  client_name: string;
  phone: string;
  email: string | null;
  note: string | null;
  total_appointments: number;
  last_appointment: string;
  appointment_history: Array<{
    id: string;
    date_time: string;
    service_type: string;
    status: string;
  }>;
}

interface ClientUpdateData {
  client_name: string;
  phone: string;
  email: string;
  note: string;
}

export default function Clients() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'new' | 'recurrent' | 'vip'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNote, setEditNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const res = await fetch('/api/clients');
      if (!res.ok) throw new Error('Failed to load clients');
      return res.json();
    }
  });

  const updateClient = useMutation({
    mutationFn: async (clientData: ClientUpdateData) => {
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

  const handleEditInit = (client: Client) => {
    setSelectedClient(client);
    setEditName(client.client_name);
    setEditPhone(client.phone || "");
    setEditEmail(client.email || "");
    setEditNote(client.note || "");
    setIsEditing(false);
  };

  const clients: Client[] = data?.clients || [];
  
  const filteredClients = clients.filter(c => {
    const matchesSearch = c.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.phone && c.phone.includes(searchTerm));
    
    let matchesType = true;
    if (filterType === 'new') matchesType = Number(c.total_appointments) === 1;
    else if (filterType === 'recurrent') matchesType = Number(c.total_appointments) > 1 && Number(c.total_appointments) <= 5;
    else if (filterType === 'vip') matchesType = Number(c.total_appointments) > 5;

    let matchesStatus = true;
    const daysSinceLast = Math.floor((new Date().getTime() - new Date(c.last_appointment).getTime()) / (1000 * 60 * 60 * 24));
    if (filterStatus === 'active') matchesStatus = daysSinceLast <= 30;
    else if (filterStatus === 'inactive') matchesStatus = daysSinceLast > 30;

    return matchesSearch && matchesType && matchesStatus;
  });

  const clearFilters = () => {
    setFilterType('all');
    setFilterStatus('all');
    setSearchTerm("");
  };

  const hasActiveFilters = filterType !== 'all' || filterStatus !== 'all' || searchTerm !== "";

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-gold flex items-center gap-3">
            <Users className="w-8 h-8" />
            Base de Clientes
          </h1>
          <p className="text-cream/40 mt-1 font-sans">Gestión y seguimiento de clientes registrados en KÂLON.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/20 group-focus-within:text-gold transition-colors" />
            <Input 
              placeholder="Buscar por nombre o teléfono..." 
              className="pl-10 bg-noir border-cream/5 focus:border-gold/30 text-cream w-full md:w-[300px] transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className={`border-cream/5 bg-noir hover:bg-white/5 text-cream/60 ${(filterType !== 'all' || filterStatus !== 'all') ? 'border-gold/30 text-gold' : ''}`}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filtros
                {(filterType !== 'all' || filterStatus !== 'all') && (
                  <Badge className="ml-2 bg-gold text-noir text-[8px] h-4 w-4 p-0 flex items-center justify-center rounded-full">
                    !
                  </Badge>
                )}
              </Button>
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
                  <Button 
                    variant="ghost" 
                    className="w-full text-[10px] h-8 text-rose hover:bg-rose/10 hover:text-rose uppercase tracking-tighter"
                    onClick={clearFilters}
                  >
                    <X className="w-3 h-3 mr-1" /> Limpiar Filtros
                  </Button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-noir/40 backdrop-blur-md border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
        <Table>
          <TableHeader className="bg-white/5">
            <TableRow className="border-cream/5 hover:bg-transparent">
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4 pl-8">Cliente</TableHead>
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4">Contacto</TableHead>
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4">Frecuencia</TableHead>
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4">Última Cita</TableHead>
              <TableHead className="text-cream/40 font-black tracking-widest text-[10px] uppercase py-4 text-right pr-8">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="animate-pulse border-cream/5">
                  <TableCell colSpan={5} className="py-12 bg-white/[0.02]" />
                </TableRow>
              ))
            ) : filteredClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-24 text-center">
                  <div className="flex flex-col items-center gap-3 opacity-20">
                    <Users className="w-12 h-12" />
                    <p className="font-serif italic">No se encontraron clientes</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredClients.map((client) => (
                <TableRow key={client.id} className="group border-cream/5 hover:bg-white/[0.02] transition-colors">
                  <TableCell className="py-5 pl-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gold/5 border border-gold/10 flex items-center justify-center text-gold font-bold text-sm">
                        {client.client_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-bold text-cream group-hover:text-gold transition-colors">{client.client_name}</p>
                        {client.note && <p className="text-[11px] text-cream/30 italic truncate max-w-[150px]">{client.note}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-5">
                    <div className="space-y-1">
                      <a 
                        href={`https://wa.me/${client.phone?.replace(/\D/g, '')}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-cream/60 hover:text-emerald-400 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        {client.phone}
                      </a>
                      {client.email && (
                        <div className="flex items-center gap-2 text-[11px] text-cream/30">
                          <Mail className="w-3.5 h-3.5" />
                          {client.email}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-5">
                    <Badge variant="outline" className="bg-gold/5 border-gold/20 text-gold text-[10px] font-bold px-2 py-0.5">
                      {client.total_appointments} {client.total_appointments === 1 ? 'VISITA' : 'VISITAS'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-5">
                    <div className="flex items-center gap-2 text-sm text-cream/60">
                      <Calendar className="w-3.5 h-3.5 text-gold/40" />
                      {new Date(client.last_appointment).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </TableCell>
                  <TableCell className="py-5 text-right pr-8">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gold hover:bg-gold/10 hover:text-gold-light font-bold text-xs"
                          onClick={() => handleEditInit(client)}
                        >
                          VER DETALLES
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="bg-noir-light border-l border-white/5 text-cream w-[400px] sm:w-[540px]">
                        {selectedClient && (
                          <div className="h-full flex flex-col pt-8">
                            <SheetHeader className="mb-6">
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-4">
                                  <div className="w-16 h-16 rounded-2xl bg-gold/5 border border-gold/10 flex items-center justify-center text-gold font-bold text-2xl shadow-xl">
                                    {(isEditing ? editName : selectedClient.client_name).split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </div>
                                  <div className="text-left">
                                    {isEditing ? (
                                      <SheetTitle className="text-2xl font-serif text-cream">Editando Perfil</SheetTitle>
                                    ) : (
                                      <SheetTitle className="text-2xl font-serif text-cream">{selectedClient.client_name}</SheetTitle>
                                    )}
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge className="bg-gold/10 text-gold border-gold/20 text-[10px]">
                                        {selectedClient.total_appointments > 5 ? 'CLIENTE VIP' : 'CLIENTE REGULAR'}
                                      </Badge>
                                      <span className="text-[10px] text-cream/20 uppercase tracking-widest font-black">ID: {selectedClient.id.slice(0,8)}</span>
                                    </div>
                                  </div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => setIsEditing(!isEditing)}
                                  className={`rounded-xl border ${isEditing ? 'border-rose/20 text-rose bg-rose/5' : 'border-white/5 text-cream/40 hover:text-gold hover:bg-gold/10 hover:border-gold/20'}`}
                                >
                                  {isEditing ? <X className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
                                </Button>
                              </div>
                            </SheetHeader>

                            {isEditing ? (
                              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="space-y-4 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                                  <div className="space-y-2">
                                    <Label className="text-[10px] uppercase tracking-widest text-cream/30">Nombre Completo</Label>
                                    <Input 
                                      value={editName} 
                                      onChange={e => setEditName(e.target.value)} 
                                      className="bg-noir-light border-white/10 focus:border-gold/30 h-11"
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <Label className="text-[10px] uppercase tracking-widest text-cream/30">WhatsApp / Tel</Label>
                                      <Input 
                                        value={editPhone} 
                                        onChange={e => setEditPhone(e.target.value)} 
                                        className="bg-noir-light border-white/10 focus:border-gold/30 h-11"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-[10px] uppercase tracking-widest text-cream/30">Email</Label>
                                      <Input 
                                        value={editEmail} 
                                        onChange={e => setEditEmail(e.target.value)} 
                                        className="bg-noir-light border-white/10 focus:border-gold/30 h-11"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-[10px] uppercase tracking-widest text-cream/30">Notas Internas / Preferencias</Label>
                                    <Textarea 
                                      value={editNote} 
                                      onChange={e => setEditNote(e.target.value)} 
                                      className="bg-noir-light border-white/10 focus:border-gold/30 min-h-[100px] resize-none"
                                      placeholder="Ej: Prefiere turnos por la tarde, alergia a ciertos productos..."
                                    />
                                  </div>
                                </div>

                                <Button 
                                  className="w-full bg-gold hover:bg-gold-light text-noir font-black h-14 rounded-2xl shadow-xl shadow-gold/20 transition-all active:scale-[0.98] disabled:opacity-50"
                                  onClick={() => updateClient.mutate({ client_name: editName, phone: editPhone, email: editEmail, note: editNote })}
                                  disabled={updateClient.isPending || !editName || !editPhone}
                                >
                                  {updateClient.isPending ? (
                                    <Activity className="w-5 h-5 animate-spin" />
                                  ) : (
                                    <>
                                      <Save className="w-5 h-5 mr-2" />
                                      GUARDAR CAMBIOS
                                    </>
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col h-full animate-in fade-in slide-in-from-left-4 duration-500">
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 group hover:border-gold/20 transition-colors">
                                    <p className="text-[10px] text-cream/40 uppercase tracking-widest mb-1">Total Visitas</p>
                                    <p className="text-2xl font-serif text-gold">{selectedClient.total_appointments}</p>
                                  </div>
                                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 group hover:border-gold/20 transition-colors">
                                    <p className="text-[10px] text-cream/40 uppercase tracking-widest mb-1">Última vez</p>
                                    <p className="text-lg font-serif text-cream">
                                      {Math.floor((new Date().getTime() - new Date(selectedClient.last_appointment).getTime()) / (1000 * 60 * 60 * 24))} días
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-6 flex-1">
                                  <div>
                                    <h3 className="text-sm font-bold text-cream/60 flex items-center gap-2 mb-4">
                                      <History className="w-4 h-4 text-gold/60" />
                                      Historial de Turnos
                                    </h3>
                                    <ScrollArea className="h-[400px] pr-4">
                                      <div className="space-y-3">
                                        {selectedClient.appointment_history?.map((appt, idx) => (
                                          <div key={appt.id} className="relative pl-6 pb-6 border-l border-white/5 last:pb-0">
                                            <div className="absolute left-[-5px] top-1 w-2 h-2 rounded-full bg-gold/40 shadow-[0_0_8px_rgba(212,175,55,0.4)]" />
                                            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                                              <div className="flex justify-between items-start mb-2">
                                                <p className="font-bold text-cream text-lg">{appt.service_type}</p>
                                                <Badge variant="outline" className={`text-[9px] ${
                                                  appt.status === 'completed' ? 'border-emerald-500/30 text-emerald-400' :
                                                  appt.status === 'canceled' ? 'border-rose-500/30 text-rose-400' :
                                                  'border-gold/30 text-gold'
                                                }`}>
                                                  {appt.status.toUpperCase()}
                                                </Badge>
                                              </div>
                                              <div className="flex items-center gap-3 text-xs text-cream/40">
                                                <div className="flex items-center gap-1">
                                                  <Calendar className="w-3 h-3" />
                                                  {new Date(appt.date_time).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  <Activity className="w-3 h-3" />
                                                                                                     {new Date(appt.date_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}hs
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        )) || (
                                          <p className="text-center text-cream/20 py-10 italic">Sin historial registrado</p>
                                        )}
                                      </div>
                                    </ScrollArea>
                                  </div>
                                </div>

                                <div className="mt-auto pt-6 border-t border-white/5">
                                  <Button 
                                    className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-black text-xs tracking-widest h-14 rounded-2xl uppercase shadow-xl shadow-emerald-500/10"
                                    onClick={() => window.open(`https://wa.me/${selectedClient.phone?.replace(/\D/g, '')}`, '_blank')}
                                  >
                                    <Phone className="w-4 h-4 mr-2" />
                                    Contactar vía WhatsApp
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </SheetContent>
                    </Sheet>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
