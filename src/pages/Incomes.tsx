import { useState, useMemo } from "react";
import { 
  TrendingUp, Calendar, DollarSign,
  ChevronDown, RefreshCw, Filter, MoreHorizontal,
  CreditCard, Wallet, Receipt
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { format } from "date-fns";
import { es } from "date-fns/locale";

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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['income', period],
    queryFn: async () => {
      const res = await fetch(`/api/income?period=${period}`);
      if (!res.ok) throw new Error('Failed to load income data');
      return res.json() as Promise<{ stats: IncomeStats, evolution: EvolutionData[], payments: Payment[] }>;
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
                          <button className="text-sm font-semibold text-cream/50 hover:text-gold transition-all flex items-center gap-2 group/btn bg-white/5 px-4 py-2 rounded-xl border border-transparent hover:border-gold/20 shadow-sm">
                            {payment.parent_service || 'Servicio General'}
                            <ChevronDown className="w-4 h-4 text-gold/30 group-hover/btn:text-gold transition-colors" />
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
                      <button className="p-3 rounded-2xl hover:bg-white/5 text-cream/20 hover:text-cream/60 transition-all border border-transparent hover:border-white/10 shadow-sm">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
