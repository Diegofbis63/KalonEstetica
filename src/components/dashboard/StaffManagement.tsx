
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Users, 
  Phone, 
  Clock, 
  Trash2, 
  Plus, 
  UserPlus, 
  Check, 
  X,
  Smartphone,
  CalendarCheck,
  Shield,
  Settings2,
  FolderLock,
  ChevronRight,
  Briefcase
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  safeFetch, 
  StaffResponseSchema, 
  CategoriesResponseSchema,
  Staff,
  Category
} from "@/lib/validations";
import { TableSkeleton } from "@/components/Skeletons";

export function StaffManagement() {
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Form state for Modal
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    role: "staff",
    work_start: "09:00",
    work_end: "18:00",
    is_active: true,
    specialties: [] as string[]
  });

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => safeFetch('/api/staff', StaffResponseSchema, { staff: [] }),
  });

  const { data: catData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => safeFetch('/api/categories', CategoriesResponseSchema, { categories: [] }),
  });

  const staffList: Staff[] = staffData?.staff || [];
  const categories: Category[] = catData?.categories || [];

  const mutation = useMutation({
    mutationFn: async (payload: Partial<Staff> & { id?: string }) => {
      const isUpdate = !!payload.id;
      const res = await fetch('/api/staff', {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Error al procesar staff');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setIsEditModalOpen(false);
      setIsAddModalOpen(false);
      toast.success("Operación exitosa");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/staff?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success("Eliminado correctamente");
    }
  });

  const openEdit = (s: Staff) => {
    setEditingStaff(s);
    setFormData({
      name: s.name,
      phone: s.phone || "",
      role: s.role || "staff",
      work_start: s.work_start || "09:00",
      work_end: s.work_end || "18:00",
      is_active: s.is_active,
      specialties: [...s.specialties]
    });
    setIsEditModalOpen(true);
  };

  const openAdd = () => {
    setFormData({
      name: "",
      phone: "",
      role: "staff",
      work_start: "09:00",
      work_end: "18:00",
      is_active: true,
      specialties: []
    });
    setIsAddModalOpen(true);
  };

  const handleSave = () => {
    if (isAddModalOpen) {
      mutation.mutate(formData);
    } else if (editingStaff) {
      mutation.mutate({ id: editingStaff.id, ...formData });
    }
  };

  const toggleCat = (catId: string) => {
    setFormData(prev => ({
      ...prev,
      specialties: prev.specialties.includes(catId) 
        ? prev.specialties.filter(id => id !== catId)
        : [...prev.specialties, catId]
    }));
  };

  if (staffLoading || categoriesLoading) return <TableSkeleton rows={8} />;

  return (
    <section className="space-y-6 animate-in slide-in-from-bottom-2 duration-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase className="w-5 h-5 text-gold/60" />
          <h3 className="text-xl font-serif font-bold text-cream">Cuerpo Profesional</h3>
        </div>
        
        <button 
          onClick={openAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-gold/10 border border-gold/20 text-gold rounded-xl hover:bg-gold/20 transition-all group"
        >
          <UserPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">Añadir Staff</span>
        </button>
      </div>

      <div className="rounded-2xl border border-cream/5 bg-noir-light/20 overflow-hidden shadow-2xl backdrop-blur-md">
        {/* Desktop Table */}
        <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-white/5 hover:bg-transparent bg-white/[0.02]">
              <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-14">Usuario</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-14">Rol</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-14">Servicios Asignados</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-14 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffList.map((s) => (
              <TableRow key={s.id} className="border-b border-white/5 hover:bg-white/[0.01] transition-colors group">
                <TableCell className="px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl border border-cream/10 bg-noir flex items-center justify-center font-serif text-sm font-bold ${s.is_active ? 'text-gold' : 'text-cream/20'}`}>
                      {s.name.charAt(0)}
                    </div>
                    <div>
                      <div className={`font-serif font-bold text-sm ${s.is_active ? 'text-cream' : 'text-cream/20 line-through'}`}>{s.name}</div>
                      <div className="text-[10px] text-cream/20 font-sans flex items-center gap-1.5 mt-0.5">
                        <Smartphone className="w-3 h-3 opacity-50" />
                        {s.phone || 'S/D'}
                        <span className="mx-1">•</span>
                        <Clock className="w-3 h-3 opacity-50" />
                        {s.work_start} - {s.work_end}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <span className="bg-noir/60 px-3 py-1 rounded-full border border-cream/5 text-[9px] uppercase tracking-widest text-cream/40 font-bold">
                    {s.role === 'admin' ? 'Coordinación' : 'Profesional'}
                  </span>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <div className="flex flex-wrap gap-1.5 max-w-[300px]">
                    {s.specialties.length > 0 ? (
                      s.specialties.map(catId => {
                        const cat = categories.find(c => c.id === catId);
                        return (
                          <span key={catId} className="px-2 py-0.5 bg-gold/5 border border-gold/10 text-[9px] text-gold/60 rounded-md whitespace-nowrap">
                            {cat?.name || 'Desconocido'}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[10px] text-cream/10 italic">Sin especialidad</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => openEdit(s)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/5 text-cream/60 rounded-lg hover:bg-gold/10 hover:text-gold hover:border-gold/20 transition-all text-[10px] font-bold uppercase tracking-widest group"
                    >
                      <FolderLock className="w-3.5 h-3.5" />
                      Gestionar
                    </button>
                    <button 
                      onClick={() => {
                        if(confirm("¿Eliminar profesional?")) deleteMutation.mutate(s.id);
                      }}
                      className="p-2 rounded-lg bg-red-500/5 text-red-500/20 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden divide-y divide-white/5">
          {staffList.map((s) => (
            <div key={s.id} className="p-6 space-y-5">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl border border-cream/10 bg-noir flex items-center justify-center font-serif text-lg font-bold ${s.is_active ? 'text-gold' : 'text-cream/20'}`}>
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className={`font-serif font-bold text-lg ${s.is_active ? 'text-cream' : 'text-cream/20 line-through'}`}>{s.name}</h4>
                    <span className="text-[9px] uppercase tracking-[0.2em] font-black text-gold/40">
                      {s.role === 'admin' ? 'Coordinación' : 'Profesional'}
                    </span>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-[8px] font-black tracking-widest border ${s.is_active ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-white/5 bg-white/5 text-cream/20'}`}>
                  {s.is_active ? 'ACTIVO' : 'SISTEMA PAUSADO'}
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-xl bg-gold/10 flex items-center justify-center">
                       <Phone className="w-4 h-4 text-gold" />
                     </div>
                     <div>
                       <div className="text-[8px] uppercase tracking-widest text-cream/30 font-black">Contacto</div>
                       <div className="text-sm font-bold text-cream">{s.phone || 'Sin dato'}</div>
                     </div>
                   </div>
                   {s.phone && (
                     <a href={`tel:${s.phone}`} className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center text-gold active:bg-gold active:text-noir transition-all">
                       <Phone className="w-4 h-4" />
                     </a>
                   )}
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                   <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                     <Clock className="w-4 h-4 text-emerald-400" />
                   </div>
                   <div>
                     <div className="text-[8px] uppercase tracking-widest text-cream/30 font-black">Horario Laboral</div>
                     <div className="text-sm font-bold text-cream capitalize">{s.work_start} A {s.work_end}</div>
                   </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[8px] uppercase tracking-widest text-cream/30 font-bold ml-1">Especialidades</div>
                <div className="flex flex-wrap gap-1.5">
                  {s.specialties.length > 0 ? (
                    s.specialties.map(catId => {
                      const cat = categories.find(c => c.id === catId);
                      return (
                        <span key={catId} className="px-3 py-1 bg-gold/5 border border-gold/10 text-[10px] text-gold/80 rounded-lg whitespace-nowrap font-bold">
                          {cat?.name || 'Servicio'}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[10px] text-cream/10 italic">Sin especialidad asignada</span>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                   onClick={() => openEdit(s)}
                   className="flex-1 flex items-center justify-center gap-3 h-12 bg-gold/10 border border-gold/20 text-gold rounded-2xl text-[10px] font-black uppercase tracking-widest"
                >
                  <Settings2 className="w-4 h-4" /> Gestionar Perfil
                </button>
                <button 
                  onClick={() => {
                    if(confirm("¿Eliminar profesional?")) deleteMutation.mutate(s.id);
                  }}
                  className="w-12 h-12 flex items-center justify-center rounded-2xl bg-rose-500/5 text-rose-500 border border-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {staffList.length === 0 && (
          <div className="py-24 text-center space-y-4">
            <Users className="w-12 h-12 text-cream/5 mx-auto" />
            <p className="font-serif text-cream/20 italic">No hay profesionales registrados.</p>
          </div>
        )}
      </div>

      {/* Management Modal (RBAC Style) */}
      <Dialog open={isEditModalOpen || isAddModalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsEditModalOpen(false);
          setIsAddModalOpen(false);
        }
      }}>
        <DialogContent className="bg-noir/98 backdrop-blur-3xl border-white/10 text-cream max-w-2xl p-0 overflow-hidden rounded-3xl">
          <div className="bg-gradient-to-br from-gold/10 via-transparent to-transparent p-8">
            <DialogHeader>
              <DialogTitle className="text-2xl font-serif font-bold text-gold flex items-center gap-3">
                <Settings2 className="w-6 h-6" />
                {isAddModalOpen ? 'Crear Nueva Cuenta de Staff' : 'Gestionar Perfil de Staff'}
              </DialogTitle>
              <p className="text-xs text-cream/30 font-sans tracking-wide mt-1">
                Configure la información personal y los servicios habilitados para el profesional.
              </p>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold ml-1">Información General</label>
                  <div className="space-y-3">
                    <input 
                      className="w-full bg-noir/50 border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gold/30 transition-all text-cream"
                      placeholder="Nombre Completo"
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    />
                    <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold/40" />
                      <input 
                        className="w-full bg-noir/50 border border-white/5 rounded-xl px-11 py-3 text-sm focus:outline-none focus:border-gold/30 transition-all text-cream"
                        placeholder="WhatsApp (ej: 11 1234-5678)"
                        value={formData.phone}
                        onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold ml-1">Jornada de Trabajo</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gold/30" />
                      <input 
                        type="time"
                        className="w-full bg-noir/50 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-gold/30 transition-all text-cream"
                        value={formData.work_start}
                        onChange={e => setFormData(f => ({ ...f, work_start: e.target.value }))}
                      />
                    </div>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gold/30" />
                      <input 
                        type="time"
                        className="w-full bg-noir/50 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-gold/30 transition-all text-cream"
                        value={formData.work_end}
                        onChange={e => setFormData(f => ({ ...f, work_end: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-cream/40 font-bold uppercase tracking-wider">Estado de Cuenta</span>
                    <button 
                      onClick={() => setFormData(f => ({ ...f, is_active: !f.is_active }))}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                        formData.is_active 
                          ? 'bg-emerald/10 border-emerald/20 text-emerald' 
                          : 'bg-white/5 border-white/10 text-cream/20'
                      }`}
                    >
                      {formData.is_active ? 'CUENTA ACTIVA' : 'SISTEMA PAUSADO'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold ml-1">Servicios Habilitados</label>
                <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto pr-2 no-scrollbar">
                  {categories.map(cat => {
                    const isSelected = formData.specialties.includes(cat.id);
                    return (
                      <button 
                        key={cat.id}
                        onClick={() => toggleCat(cat.id)}
                        className={`group flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                          isSelected 
                            ? 'bg-gold/10 border-gold/30 text-gold' 
                            : 'bg-white/[0.02] border-white/5 text-cream/40 hover:bg-white/[0.05]'
                        }`}
                      >
                        <span className="text-xs font-serif font-bold">{cat.name}</span>
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-gold text-noir flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 stroke-[3px]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-white/10 group-hover:border-white/20 transition-all" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            
            <div className="pt-6 border-t border-white/5 flex items-center justify-between">
               <div className="flex items-center gap-2 text-[10px] text-cream/20 italic">
                 <Shield className="w-3 h-3" />
                 Los cambios se sincronizan en tiempo real
               </div>
               <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setIsAddModalOpen(false);
                    }}
                    className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-cream/20 hover:text-cream transition-colors"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!formData.name || mutation.isPending}
                    className="bg-gold text-noir px-10 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-xl shadow-gold/10 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {mutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
               </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
