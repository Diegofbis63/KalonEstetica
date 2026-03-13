import { useState, useMemo } from "react";
import { 
  TrendingUp, Calendar, DollarSign, ArrowUpRight, 
  ChevronDown, RefreshCw, Filter, MoreHorizontal,
  ChevronRight, CreditCard, Wallet, Receipt
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
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <div className="h-full flex flex-col space-y-8 animate-in fade-in duration-700">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-cream tracking-tight mb-1">Ingresos y Finanzas</h1>
          <p className="text-cream/40 text-sm font-sans italic">Análisis de facturación en vivo — {period === 'mes' ? 'Este Mes' : period.toUpperCase()}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-noir-light/30 border border-white/5 p-1 rounded-xl backdrop-blur-md">
            {(['hoy', 'semana', 'mes', 'año', 'personalizado'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  period === p 
                    ? 'bg-gold text-noir shadow-lg shadow-gold/20' 
                    : 'text-cream/40 hover:text-cream/70 hover:bg-white/5'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          
          <button 
            onClick={() => refetch()}
            className="p-2.5 rounded-xl bg-noir-light border border-white/5 hover:border-gold/30 transition-all group"
          >
            <RefreshCw className="w-4 h-4 text-gold/40 group-hover:text-gold transition-colors" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Billing */}
        <div className="p-6 rounded-2xl border border-white/[0.03] bg-noir-light/20 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4">
            <div className="p-2 rounded-lg bg-gold/10 text-gold border border-gold/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-[10px] text-cream/30 uppercase tracking-[0.2em] font-bold mb-4">Facturación Total</p>
          <h3 className="text-3xl font-serif font-bold text-cream mb-2">
            {isLoading ? '...' : formatCurrency(stats?.revenue || 0)}
          </h3>
          <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
            <TrendingUp className="w-3 h-3" />
            <span>Este Período</span>
          </div>
        </div>

        {/* Average Ticket */}
        <div className="p-6 rounded-2xl border border-white/[0.03] bg-noir-light/20 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-[10px] text-cream/30 uppercase tracking-[0.2em] font-bold mb-4">Ticket Promedio</p>
          <h3 className="text-3xl font-serif font-bold text-cream mb-2">
            {isLoading ? '...' : formatCurrency(stats?.ticket || 0)}
          </h3>
          <p className="text-cream/20 text-[10px] uppercase font-bold tracking-wider">Por servicio realizado</p>
        </div>

        {/* Appointments Count */}
        <div className="p-6 rounded-2xl border border-white/[0.03] bg-noir-light/20 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-[10px] text-cream/30 uppercase tracking-[0.2em] font-bold mb-4">Citas en Período</p>
          <h3 className="text-3xl font-serif font-bold text-cream mb-2">
            {isLoading ? '...' : stats?.count || 0}
          </h3>
          <p className="text-cream/20 text-[10px] uppercase font-bold tracking-wider">{period === 'mes' ? 'Este Mes' : 'Total Período'}</p>
        </div>
      </div>

      {/* Evolution Chart */}
      <div className="p-8 rounded-3xl border border-white/[0.03] bg-noir-light/10 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-serif font-bold text-cream">Evolución de Ingresos</h3>
            <p className="text-cream/30 text-xs italic">Facturación de servicios premium — Este Mes</p>
          </div>
        </div>
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c29a5b" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#c29a5b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
              <XAxis 
                dataKey="formattedDate" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#ffffff30', fontSize: 10, fontWeight: 'bold' }} 
              />
              <YAxis 
                hide 
                domain={['auto', 'auto']}
              />
              <RechartsTooltip 
                contentStyle={{ 
                  backgroundColor: '#0a0a0a', 
                  border: '1px solid #c29a5b20', 
                  borderRadius: '12px',
                  color: '#f5f5f0'
                }}
                itemStyle={{ color: '#c29a5b' }}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#c29a5b" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
                animationBegin={300}
                animationDuration={2000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Payments Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
           <div className="flex items-center gap-3">
             <div className="w-1 h-6 bg-gold rounded-full" />
             <h3 className="text-xl font-serif font-bold tracking-tight">Últimos Pagos Recibidos</h3>
           </div>
           <span className="text-[10px] text-cream/20 font-bold uppercase tracking-widest">{payments.length} registros</span>
        </div>

        <div className="rounded-2xl border border-white/[0.03] bg-noir-light/10 overflow-hidden">
          <Table>
            <TableHeader className="bg-white/[0.02]">
              <TableRow className="hover:bg-transparent border-white/5">
                <TableHead className="text-[10px] text-cream/40 px-6 py-4 uppercase tracking-[0.2em] font-black">Cliente</TableHead>
                <TableHead className="text-[10px] text-cream/40 px-6 py-4 uppercase tracking-[0.2em] font-black">Servicio</TableHead>
                <TableHead className="text-[10px] text-cream/40 px-6 py-4 uppercase tracking-[0.2em] font-black">Fecha</TableHead>
                <TableHead className="text-[10px] text-cream/40 px-6 py-4 uppercase tracking-[0.2em] font-black">Monto</TableHead>
                <TableHead className="text-[10px] text-cream/40 px-6 py-4 uppercase tracking-[0.2em] font-black">Estado</TableHead>
                <TableHead className="text-[10px] text-cream/40 px-6 py-4 uppercase tracking-[0.2em] font-black text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="animate-pulse border-white/5">
                    <TableCell colSpan={6} className="h-16 px-6"><div className="w-full h-4 bg-white/5 rounded" /></TableCell>
                  </TableRow>
                ))
              ) : payments.map((payment) => (
                <TableRow key={payment.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gold/5 border border-gold/10 flex items-center justify-center text-gold font-bold text-xs">
                        {payment.client_name[0]}
                      </div>
                      <span className="text-sm font-bold text-cream/80">{payment.client_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-sm font-medium text-cream/60 hover:text-gold transition-colors flex items-center gap-2">
                          {payment.parent_service || 'Servicio General'}
                          <ChevronDown className="w-3 h-3 text-gold/30" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 bg-noir border-gold/20 p-4">
                        <div className="space-y-3">
                          <p className="text-[10px] text-gold font-bold uppercase tracking-widest border-b border-gold/10 pb-2">Sub-servicios realizados</p>
                          <div className="space-y-2">
                            {payment.selected_services?.map((s, idx) => (
                              <div key={idx} className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
                                <span className="text-[11px] text-cream/80">{s.title}</span>
                                <span className="text-[11px] text-gold font-mono font-bold">{formatCurrency(Number(s.price))}</span>
                              </div>
                            ))}
                            {(!payment.selected_services || payment.selected_services.length === 0) && (
                              <p className="text-[10px] text-cream/40 italic">No hay detalles de sub-servicios</p>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <span className="text-xs text-cream/40 font-mono">
                      {format(new Date(payment.date), "dd MMM, HH:mm 'hs'", { locale: es })}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-serif font-black text-cream">{formatCurrency(payment.amount)}</span>
                      <div className="flex items-center gap-1 mt-1">
                        {payment.payment_method === 'Efectivo' ? <Wallet className="w-2.5 h-2.5 text-emerald-500" /> : <CreditCard className="w-2.5 h-2.5 text-indigo-400" />}
                        <span className="text-[9px] text-cream/20 uppercase font-black tracking-widest">{payment.payment_method}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5">
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 py-5 text-right">
                    <button className="p-2 rounded-lg hover:bg-white/5 text-cream/20 hover:text-cream/60 transition-all">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
