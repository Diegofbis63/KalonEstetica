import { useState, useMemo } from "react";
import { 
  TrendingUp, Calendar, DollarSign,
  ChevronDown, RefreshCw, Filter, MoreHorizontal,
  CreditCard, Wallet, Receipt, Eye, Edit3, Trash2, 
  FileText, Copy, Share2, Check, ExternalLink, X
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer 
} from 'recharts';
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface IncomeStats {
  revenue: number;
  ticket: number;
  count: number;
}

interface EvolutionData {
  date: string;
  revenue: number;
}

interface Payment {
  id: string;
  client_name: string;
  parent_service: string;
  selected_services: Array<{ title: string, price: number }>;
  date: string;
  amount: number;
  status: string;
  payment_method: string;
  phone?: string;
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(val);
};

export default function Incomes() {
  const [period, setPeriod] = useState<'hoy' | 'semana' | 'mes' | 'año' | 'personalizado'>('mes');
  const queryClient = useQueryClient();

  // Modal States
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isVoidConfirmOpen, setIsVoidConfirmOpen] = useState(false);

  // Edit Form States
  const [editAmount, setEditAmount] = useState<string>("");
  const [editMethod, setEditMethod] = useState<string>("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['income', period],
    queryFn: async () => {
      const res = await fetch(`/api/income?period=${period}`);
      if (!res.ok) throw new Error('Failed to load income data');
      return res.json() as Promise<{ stats: IncomeStats, evolution: EvolutionData[], payments: Payment[] }>;
    }
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, amount, method }: { id: string; amount: number; method: string }) => {
      const res = await fetch(`/api/appointments?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_price: amount, payment_method: method })
      });
      if (!res.ok) throw new Error('Error al actualizar el pago');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income'] });
      toast.success("Pago actualizado correctamente");
      setIsEditModalOpen(false);
    },
    onError: () => {
      toast.error("Ocurrió un error al intentar actualizar el pago");
    }
  });

  const voidPaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/appointments?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ANULADA' })
      });
      if (!res.ok) throw new Error('Error al anular el pago');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income'] });
      toast.success("Transacción anulada. El monto ha sido restado de la facturación.");
      setIsVoidConfirmOpen(false);
    },
    onError: () => {
      toast.error("Ocurrió un error al intentar anular la transacción");
    }
  });

  const stats = data?.stats;
  const evolution = data?.evolution || [];
  const payments = data?.payments || [];

  const chartData = useMemo(() => {
    return (data?.evolution || []).map(d => ({
      ...d,
      formattedDate: format(new Date(d.date), 'dd MMM', { locale: es })
    }));
  }, [data?.evolution]);

  const handleOpenEdit = (payment: Payment) => {
    setSelectedPayment(payment);
    setEditAmount(payment.amount.toString());
    setEditMethod(payment.payment_method);
    setIsEditModalOpen(true);
  };

  const handleCopyReceipt = (payment: Payment) => {
    const text = `*COMPROBANTE DE PAGO - KÂLON*\n\n` +
      `*Cliente:* ${payment.client_name}\n` +
      `*Fecha:* ${format(new Date(payment.date), "dd/MM/yyyy HH:mm")}\n` +
      `*Servicios:* ${payment.parent_service}\n` +
      `*Monto:* ${formatCurrency(payment.amount)}\n` +
      `*Método:* ${payment.payment_method}\n\n` +
      `¡Gracias por elegir Kâlon Estética! ✨`;
    
    navigator.clipboard.writeText(text);
    toast.success("Resumen copiado al portapapeles");
  };

  const handleShareWhatsApp = (payment: Payment) => {
    const text = encodeURIComponent(`*COMPROBANTE DE PAGO - KÂLON*\n\n` +
      `*Cliente:* ${payment.client_name}\n` +
      `*Fecha:* ${format(new Date(payment.date), "dd/MM/yyyy HH:mm")}\n` +
      `*Servicios:* ${payment.parent_service}\n` +
      `*Monto:* ${formatCurrency(payment.amount)}\n` +
      `*Método:* ${payment.payment_method}\n\n` +
      `¡Gracias por elegir Kâlon Estética! ✨`);
    
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="h-full flex flex-col items-center animate-in fade-in duration-700 overflow-y-auto custom-scrollbar bg-noir/20">
      <div className="max-w-7xl w-full px-6 py-12 space-y-12">
        {/* Header & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <h1 className="text-4xl font-serif font-bold text-cream tracking-tight mb-2">Ingresos y Finanzas</h1>
            <p className="text-cream/40 text-sm font-sans italic tracking-wide">
              Análisis de facturación en vivo — <span className="text-gold font-bold">{period === 'mes' ? 'Este Mes' : period.toUpperCase()}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-noir-light/40 border border-white/5 p-1.5 rounded-2xl backdrop-blur-xl shadow-2xl">
              {(['hoy', 'semana', 'mes', 'año', 'personalizado'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${
                    period === p 
                      ? 'bg-gold text-noir shadow-[0_8px_20px_rgba(194,154,91,0.3)]' 
                      : 'text-cream/30 hover:text-cream/60 hover:bg-white/5'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => refetch()}
              className="p-3 rounded-2xl bg-noir-light border border-white/5 hover:border-gold/30 transition-all group shadow-xl"
            >
              <RefreshCw className="w-5 h-5 text-gold/30 group-hover:text-gold transition-colors" />
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Total Billing */}
          <div className="p-10 rounded-[2rem] border border-white/[0.05] bg-gradient-to-br from-noir-light/40 to-noir/10 backdrop-blur-xl relative overflow-hidden group shadow-2xl transition-all hover:scale-[1.02] hover:border-gold/20">
            <div className="absolute top-0 right-0 p-6">
              <div className="p-3 rounded-2xl bg-gold/10 text-gold border border-gold/20">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-cream/30 uppercase tracking-[0.25em] font-black mb-6">Facturación Total</p>
            <h3 className="text-4xl font-serif font-bold text-cream mb-3 tracking-tighter">
              {isLoading ? '...' : formatCurrency(stats?.revenue || 0)}
            </h3>
            <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-black uppercase tracking-widest">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <TrendingUp className="w-4 h-4" />
              <span>Corte {period}</span>
            </div>
          </div>

          {/* Average Ticket */}
          <div className="p-10 rounded-[2rem] border border-white/[0.05] bg-gradient-to-br from-noir-light/40 to-noir/10 backdrop-blur-xl relative overflow-hidden group shadow-2xl transition-all hover:scale-[1.02] hover:border-emerald-500/20">
            <div className="absolute top-0 right-0 p-6">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-cream/30 uppercase tracking-[0.25em] font-black mb-6">Ticket Promedio</p>
            <h3 className="text-4xl font-serif font-bold text-cream mb-3 tracking-tighter">
              {isLoading ? '...' : formatCurrency(stats?.ticket || 0)}
            </h3>
            <p className="text-cream/20 text-[11px] uppercase font-black tracking-widest flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Por servicio único
            </p>
          </div>

          {/* Appointments Count */}
          <div className="p-10 rounded-[2rem] border border-white/[0.05] bg-gradient-to-br from-noir-light/40 to-noir/10 backdrop-blur-xl relative overflow-hidden group shadow-2xl transition-all hover:scale-[1.02] hover:border-indigo-500/20">
            <div className="absolute top-0 right-0 p-6">
              <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Calendar className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-cream/30 uppercase tracking-[0.25em] font-black mb-6">Citas en Período</p>
            <h3 className="text-4xl font-serif font-bold text-cream mb-3 tracking-tighter">
              {isLoading ? '...' : stats?.count || 0}
            </h3>
            <p className="text-cream/20 text-[11px] uppercase font-black tracking-widest flex items-center gap-2">
              <Filter className="w-4 h-4" /> {period === 'mes' ? 'Estado Realizada' : 'Total Período'}
            </p>
          </div>
        </div>

        {/* Evolution Chart */}
        <div className="p-10 rounded-[2.5rem] border border-white/[0.05] bg-noir-light/5 backdrop-blur-md shadow-3xl">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-2xl font-serif font-bold text-cream mb-1">Evolución de Ingresos</h3>
              <p className="text-cream/30 text-sm italic tracking-wide">Curva de crecimiento financiero — Flujo de caja real</p>
            </div>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c29a5b" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#c29a5b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff03" />
                <XAxis 
                  dataKey="formattedDate" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#ffffff20', fontSize: 11, fontWeight: 'bold' }} 
                  dy={15}
                />
                <YAxis 
                  hide 
                  domain={['auto', 'auto']}
                />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: '#0a0a0a', 
                    border: '1px solid #c29a5b30', 
                    borderRadius: '20px',
                    padding: '15px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                    color: '#f5f5f0'
                  }}
                  itemStyle={{ color: '#c29a5b', fontWeight: 'bold' }}
                  cursor={{ stroke: '#c29a5b40', strokeWidth: 2 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#c29a5b" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                  animationBegin={300}
                  animationDuration={2500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Payments Table */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-8 bg-gold rounded-full shadow-[0_0_15px_rgba(194,154,91,0.5)]" />
              <h3 className="text-2xl font-serif font-bold tracking-tight">Registro de Transacciones</h3>
            </div>
            <div className="px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/5 shadow-inner">
               <span className="text-[10px] text-gold font-black uppercase tracking-[0.2em]">{payments.length} Registros</span>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/[0.05] bg-noir-light/5 overflow-hidden shadow-2xl">
            <Table>
              <TableHeader className="bg-white/[0.03]">
                <TableRow className="hover:bg-transparent border-white/5 h-16">
                  <TableHead className="text-[11px] text-cream/30 px-8 py-5 uppercase tracking-[0.25em] font-black">Cliente</TableHead>
                  <TableHead className="text-[11px] text-cream/30 px-8 py-5 uppercase tracking-[0.25em] font-black">Servicio</TableHead>
                  <TableHead className="text-[11px] text-cream/30 px-8 py-5 uppercase tracking-[0.25em] font-black">Fecha</TableHead>
                  <TableHead className="text-[11px] text-cream/30 px-8 py-5 uppercase tracking-[0.25em] font-black">Monto</TableHead>
                  <TableHead className="text-[11px] text-cream/30 px-8 py-5 uppercase tracking-[0.25em] font-black">Estado</TableHead>
                  <TableHead className="text-[11px] text-cream/30 px-8 py-5 uppercase tracking-[0.25em] font-black text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse border-white/5">
                      <TableCell colSpan={6} className="h-24 px-8"><div className="w-full h-6 bg-white/5 rounded-xl" /></TableCell>
                    </TableRow>
                  ))
                ) : payments.map((payment) => (
                  <TableRow key={payment.id} className="border-white/5 hover:bg-white/[0.03] transition-all duration-300 group">
                    <TableCell className="px-8 py-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-gold/5 border border-gold/10 flex items-center justify-center text-gold font-black text-sm shadow-inner group-hover:scale-110 transition-transform">
                          {payment.client_name[0]}
                        </div>
                        <span className="text-base font-bold text-cream/80 group-hover:text-cream transition-colors">{payment.client_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-8">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-sm font-semibold text-cream/50 hover:text-gold transition-all flex items-center gap-2 group/btn bg-white/5 px-4 py-2 rounded-xl border border-transparent hover:border-gold/20 shadow-sm text-left">
                            <span className="truncate max-w-[150px]">{payment.parent_service || 'Servicio General'}</span>
                            <ChevronDown className="w-4 h-4 shrink-0 text-gold/30 group-hover/btn:text-gold transition-colors" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 bg-noir-light border-gold/20 p-6 rounded-[1.5rem] shadow-3xl backdrop-blur-xl">
                          <div className="space-y-4">
                            <p className="text-[11px] text-gold font-black uppercase tracking-[0.3em] border-b border-gold/10 pb-3">Detalle de Sesión</p>
                            <div className="space-y-2.5">
                              {payment.selected_services?.map((s, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5 group/service hover:bg-white/10 transition-colors">
                                  <span className="text-xs text-cream/70 font-medium">{s.title}</span>
                                  <span className="text-xs text-gold font-mono font-black">{formatCurrency(Number(s.price))}</span>
                                </div>
                              ))}
                              {(!payment.selected_services || payment.selected_services.length === 0) && (
                                <p className="text-xs text-cream/30 italic py-2">No hay detalles de sub-servicios registrados</p>
                              )}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell className="px-8 py-8">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-cream font-bold tracking-tight">
                          {format(new Date(payment.date), "dd MMMM", { locale: es })}
                        </span>
                        <span className="text-[10px] text-cream/30 font-black uppercase tracking-widest">
                          {format(new Date(payment.date), "HH:mm 'hs'", { locale: es })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-8">
                      <div className="flex flex-col">
                        <span className="text-lg font-serif font-black text-cream tracking-tighter group-hover:text-gold transition-colors">{formatCurrency(payment.amount)}</span>
                        <div className="flex items-center gap-2 mt-1.5">
                          {payment.payment_method === 'Efectivo' ? (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                              <Wallet className="w-2.5 h-2.5 text-emerald-500" />
                              <span className="text-[9px] text-emerald-400 uppercase font-black tracking-widest">{payment.payment_method}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
                              <CreditCard className="w-2.5 h-2.5 text-indigo-400" />
                              <span className="text-[9px] text-indigo-400 uppercase font-black tracking-widest">{payment.payment_method}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-8">
                      <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1 rounded-full shadow-sm">
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 py-8 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-3 rounded-2xl hover:bg-white/5 text-cream/20 hover:text-cream/60 transition-all border border-transparent hover:border-white/10 shadow-sm">
                            <MoreHorizontal className="w-5 h-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-noir-light border-white/5 text-cream/80 backdrop-blur-xl rounded-2xl shadow-3xl p-2 pb-3">
                          <p className="px-3 py-2 text-[10px] uppercase font-black tracking-[0.2em] text-gold/50">Opciones de Pago</p>
                          <DropdownMenuItem 
                            onClick={() => { setSelectedPayment(payment); setIsDetailModalOpen(true); }}
                            className="focus:bg-white/10 focus:text-gold cursor-pointer rounded-xl h-11 flex items-center gap-3 px-3"
                          >
                            <Eye className="w-4 h-4" /> 
                            <span className="text-sm font-semibold">Ver Detalle</span>
                          </DropdownMenuItem>
                          
                          <DropdownMenuItem 
                            onClick={() => handleOpenEdit(payment)}
                            className="focus:bg-white/10 focus:text-gold cursor-pointer rounded-xl h-11 flex items-center gap-3 px-3"
                          >
                            <Edit3 className="w-4 h-4" /> 
                            <span className="text-sm font-semibold">Editar Pago</span>
                          </DropdownMenuItem>
                          
                          <DropdownMenuItem 
                            onClick={() => { setSelectedPayment(payment); setIsVoidConfirmOpen(true); }}
                            className="focus:bg-rose-500/10 focus:text-rose-400 cursor-pointer rounded-xl h-11 flex items-center gap-3 px-3"
                          >
                            <Trash2 className="w-4 h-4" /> 
                            <span className="text-sm font-semibold">Anular Pago</span>
                          </DropdownMenuItem>

                          <DropdownMenuSeparator className="bg-white/5 my-2" />
                          
                          <p className="px-3 py-2 text-[10px] uppercase font-black tracking-[0.2em] text-gold/50">Comprobante</p>
                          
                          <DropdownMenuItem 
                            onClick={() => handleCopyReceipt(payment)}
                            className="focus:bg-white/10 focus:text-gold cursor-pointer rounded-xl h-11 flex items-center gap-3 px-3"
                          >
                            <Copy className="w-4 h-4" /> 
                            <span className="text-sm font-semibold">Copiar Resumen</span>
                          </DropdownMenuItem>
                          
                          <DropdownMenuItem 
                            onClick={() => handleShareWhatsApp(payment)}
                            className="focus:bg-emerald-500/10 focus:text-emerald-400 cursor-pointer rounded-xl h-11 flex items-center gap-3 px-3"
                          >
                            <Share2 className="w-4 h-4" /> 
                            <span className="text-sm font-semibold">Enviar Wsp</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="max-w-md bg-noir-light border-gold/20 text-cream backdrop-blur-3xl rounded-[2.5rem] p-0 overflow-hidden shadow-3xl">
          <DialogHeader className="p-8 pb-4 bg-white/5">
            <DialogTitle className="text-2xl font-serif font-bold text-cream flex items-center gap-3">
              <FileText className="w-6 h-6 text-gold" />
              Detalle de Transacción
            </DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-8">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-black tracking-[0.2em] text-gold/50">Cliente</p>
                <p className="text-xl font-bold">{selectedPayment?.client_name}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[10px] uppercase font-black tracking-[0.2em] text-gold/50">Fecha</p>
                <p className="text-sm font-semibold text-cream/70">
                  {selectedPayment && format(new Date(selectedPayment.date), "dd/MM/yyyy HH:mm")}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] uppercase font-black tracking-[0.2em] text-gold/50 flex items-center gap-2">
                <Filter className="w-3 h-3" /> Desglose de Servicios
              </p>
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {selectedPayment?.selected_services?.map((service, idx) => (
                  <div key={idx} className="flex justify-between items-center p-4 rounded-2xl bg-white/5 border border-white/5">
                    <span className="text-sm font-medium text-cream/80">{service.title}</span>
                    <span className="text-sm font-black text-gold font-mono">{formatCurrency(service.price)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-white/5 space-y-4">
              <div className="flex justify-between items-center bg-gold/10 p-5 rounded-2xl border border-gold/20">
                <span className="text-sm uppercase font-black tracking-[0.2em] text-gold">Total Abonado</span>
                <span className="text-2xl font-serif font-black text-gold">{selectedPayment && formatCurrency(selectedPayment.amount)}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-cream/30 justify-center">
                <CreditCard className="w-3 h-3" /> Pago vía {selectedPayment?.payment_method}
              </div>
            </div>
          </div>
          <DialogFooter className="p-6 bg-white/5 flex gap-3">
            <Button variant="outline" className="flex-1 bg-transparent border-white/10 hover:bg-white/5 rounded-xl h-12" onClick={() => setIsDetailModalOpen(false)}>
              Cerrar
            </Button>
            <Button className="flex-1 bg-gold text-noir hover:bg-gold/80 rounded-xl h-12" onClick={() => selectedPayment && handleShareWhatsApp(selectedPayment)}>
              Compartir Wsp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md bg-noir-light border-gold/20 text-cream backdrop-blur-3xl rounded-[2.5rem] p-0 overflow-hidden shadow-3xl">
          <DialogHeader className="p-8 pb-4 bg-white/5">
            <DialogTitle className="text-2xl font-serif font-bold text-cream flex items-center gap-3">
              <Edit3 className="w-6 h-6 text-gold" />
              Editar Transacción
            </DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-gold/50 ml-1">Monto Total</Label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold" />
                  <Input 
                    type="number" 
                    value={editAmount} 
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="bg-white/5 border-white/10 h-14 pl-12 rounded-2xl focus:ring-gold focus:border-gold text-lg font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-gold/50 ml-1">Método de Pago</Label>
                <Select value={editMethod} onValueChange={setEditMethod}>
                  <SelectTrigger className="bg-white/5 border-white/10 h-14 rounded-2xl focus:ring-gold">
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent className="bg-noir-light border-white/5 text-cream">
                    <SelectItem value="Efectivo" className="focus:bg-gold/10 focus:text-gold h-12">Efectivo</SelectItem>
                    <SelectItem value="Transferencia" className="focus:bg-gold/10 focus:text-gold h-12">Transferencia</SelectItem>
                    <SelectItem value="Tarjeta" className="focus:bg-gold/10 focus:text-gold h-12">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-[10px] text-cream/40 italic text-center px-4 leading-relaxed">
              * El cambio afectará el total facturado y el flujo de caja del periodo seleccionado.
            </p>
          </div>
          <DialogFooter className="p-8 flex gap-3">
            <Button variant="outline" className="flex-1 bg-transparent border-white/10 hover:bg-white/5 rounded-xl h-14" onClick={() => setIsEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              className="flex-1 bg-gold text-noir hover:bg-gold/80 rounded-xl h-14 font-bold shadow-[0_8px_25px_rgba(194,154,91,0.4)]"
              disabled={updatePaymentMutation.isPending}
              onClick={() => selectedPayment && updatePaymentMutation.mutate({ 
                id: selectedPayment.id, 
                amount: parseFloat(editAmount), 
                method: editMethod 
              })}
            >
              {updatePaymentMutation.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Confirm Modal */}
      <Dialog open={isVoidConfirmOpen} onOpenChange={setIsVoidConfirmOpen}>
        <DialogContent className="max-w-md bg-noir-light border-rose-500/20 text-cream backdrop-blur-3xl rounded-[2.5rem] p-0 overflow-hidden shadow-3xl">
          <div className="p-10 text-center space-y-6">
            <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
              <Trash2 className="w-10 h-10 text-rose-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-serif font-bold">¿Anular transacción?</h3>
              <p className="text-cream/50 text-sm leading-relaxed px-6">
                Esta acción marcará el pago como <span className="text-rose-400 font-bold uppercase tracking-wider">Anulado</span>. El monto de <span className="text-white font-black">{selectedPayment && formatCurrency(selectedPayment.amount)}</span> se restará de los totales de facturación.
              </p>
            </div>
            
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-left">
              <p className="text-[9px] uppercase font-black tracking-widest text-cream/30 mb-1">Cliente</p>
              <p className="text-sm font-bold">{selectedPayment?.client_name}</p>
            </div>
          </div>
          <DialogFooter className="p-8 pt-0 flex gap-3">
            <Button variant="outline" className="flex-1 bg-transparent border-white/10 hover:bg-white/5 rounded-xl h-14" onClick={() => setIsVoidConfirmOpen(false)}>
              No, Volver
            </Button>
            <Button 
              className="flex-1 bg-rose-500 text-white hover:bg-rose-600 rounded-xl h-14 font-bold"
              disabled={voidPaymentMutation.isPending}
              onClick={() => selectedPayment && voidPaymentMutation.mutate(selectedPayment.id)}
            >
              {voidPaymentMutation.isPending ? "Anulando..." : "Sí, Anular Pago"}
            </Button>
          </DialogFooter>
          <button 
            onClick={() => setIsVoidConfirmOpen(false)}
            className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-cream/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
