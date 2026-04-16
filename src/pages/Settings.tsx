
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Shield, Save, Key, ChevronRight, Lock, Eye, EyeOff, UserCog, Contact2 } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { toast } from "sonner";
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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  safeFetch, 
  UsersResponseSchema, 
  CategoriesResponseSchema,
  UserAccount,
  Category
} from "@/lib/validations";
import { StaffManagement } from "@/components/dashboard/StaffManagement";

export default function Settings() {
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Edit form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  const { data: userData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => safeFetch('/api/users', UsersResponseSchema, { users: [] }),
    staleTime: 60000,
  });

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => safeFetch('/api/categories', CategoriesResponseSchema, { categories: [] }),
    staleTime: 300000,
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; username?: string; password?: string; category_ids?: string[] }) => {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Error al actualizar');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setIsEditModalOpen(false);
      toast.success("Usuario actualizado correctamente");
    }
  });

  if (authUser?.role !== 'admin') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-10 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose/10 flex items-center justify-center border border-rose/20">
          <Lock className="w-8 h-8 text-rose" />
        </div>
        <h2 className="text-2xl font-serif font-bold text-cream">Acceso Restringido</h2>
        <p className="text-cream/30 max-w-md font-sans">
          Solo el administrador principal tiene permisos para gestionar el equipo y el acceso al sistema.
        </p>
      </div>
    );
  }

  const handleEdit = (user: UserAccount) => {
    setSelectedUser(user);
    setUsername(user.username);
    setPassword(""); 
    setSelectedCats(user.category_ids || []);
    setIsEditModalOpen(true);
    setShowPassword(false);
  };

  const handleSave = () => {
    if (!selectedUser) return;
    updateMutation.mutate({
      id: selectedUser.id,
      username,
      password: password || undefined,
      category_ids: selectedCats
    });
  };

  const toggleCategory = (id: string) => {
    setSelectedCats(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const categories: Category[] = catData?.categories || [];

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-gold" />
          <h2 className="text-3xl font-serif font-bold tracking-tight">Configuración</h2>
        </div>
        <p className="text-cream/30 font-sans text-sm italic">Gestión de equipo y control de acceso premium (RBAC)</p>
      </header>

      <Tabs defaultValue="team" className="w-full space-y-8">
        <TabsList className="bg-noir-light/30 border border-white/5 p-1 rounded-2xl w-full grid grid-cols-2 h-auto">
          <TabsTrigger value="team" className="flex flex-col sm:flex-row items-center gap-2 rounded-xl text-[9px] sm:text-[10px] uppercase tracking-widest font-black data-[state=active]:bg-gold data-[state=active]:text-noir transition-all py-3 px-2 sm:px-6">
            <Contact2 className="w-4 h-4" />
            <span className="text-center">Staff Control</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="flex flex-col sm:flex-row items-center gap-2 rounded-xl text-[9px] sm:text-[10px] uppercase tracking-widest font-black data-[state=active]:bg-gold data-[state=active]:text-noir transition-all py-3 px-2 sm:px-6">
            <UserCog className="w-4 h-4" />
            <span className="text-center">Sistema Admin</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="mt-0">
          <StaffManagement />
        </TabsContent>

        <TabsContent value="access" className="mt-0 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-gold/60" />
              <h3 className="text-lg font-serif font-bold">Cuentas de Usuarios</h3>
            </div>
          </div>

          <div className="rounded-2xl border border-cream/5 bg-noir-light/20 overflow-hidden shadow-2xl backdrop-blur-md">
            {/* Desktop Table View */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-cream/5 hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12">Usuario</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12 hidden sm:table-cell">Rol</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12 hidden md:table-cell">Permisos de Visualización</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-cream/30 px-6 h-12 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userData?.users?.map((u: UserAccount) => (
                  <TableRow key={u.id} className="border-b border-cream/5 hover:bg-white/[0.02] transition-colors group">
                    <TableCell className="px-6 py-4">
                      <div className="font-serif font-bold text-cream">{u.username}</div>
                      <div className="text-[10px] text-cream/20 font-sans">{u.email}</div>
                    </TableCell>
                    <TableCell className="px-6 py-4 hidden sm:table-cell">
                      <Badge variant="outline" className={`
                        uppercase text-[9px] tracking-widest font-bold
                        ${u.role === 'admin' ? 'border-gold/30 text-gold bg-gold/5' : 'border-cream/10 text-cream/40'}
                      `}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-4 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {u.role === 'admin' ? (
                          <span className="text-[10px] text-gold italic font-serif">Acceso Total</span>
                        ) : (
                          u.category_ids?.length > 0 ? (
                             categories
                              .filter(c => u.category_ids.includes(c.id))
                              .map(c => (
                                <span key={c.id} className="text-[9px] px-2 py-0.5 rounded-full bg-cream/5 text-cream/50 border border-cream/10">
                                  {c.name}
                                </span>
                              ))
                          ) : <span className="text-[10px] text-cream/10 italic">Sin permisos</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleEdit(u)}
                        className="p-2 rounded-lg bg-cream/5 text-cream/40 hover:text-gold transition-colors inline-flex items-center gap-2 group/btn"
                      >
                        <Save className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                        <span className="text-[10px] font-bold uppercase tracking-tight">Gestionar</span>
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-white/5">
              {userData?.users?.map((u: UserAccount) => (
                <div key={u.id} className="p-6 space-y-5">
                   <div className="flex justify-between items-start">
                     <div className="space-y-1">
                        <div className="font-serif font-bold text-xl text-cream tracking-tight">{u.username}</div>
                        <div className="text-[10px] text-cream/30 font-sans tracking-wide">{u.email}</div>
                     </div>
                     <Badge variant="outline" className={`
                        uppercase text-[8px] tracking-[0.2em] font-black px-3 py-1 rounded-full
                        ${u.role === 'admin' ? 'border-gold/30 text-gold bg-gold/5 shadow-[0_0_10px_rgba(194,154,91,0.1)]' : 'border-cream/10 text-cream/40'}
                      `}>
                        {u.role === 'admin' ? 'ADMIN' : 'STAFF'}
                      </Badge>
                   </div>

                   <div className="bg-white/5 border border-white/5 p-4 rounded-2xl space-y-3">
                      <div className="text-[8px] uppercase tracking-widest text-cream/30 font-bold">Permisos de Visualización</div>
                      <div className="flex flex-wrap gap-1.5">
                        {u.role === 'admin' ? (
                          <div className="flex items-center gap-2 text-gold font-serif italic text-xs">
                             <Shield className="w-3.5 h-3.5" /> Acceso Total al Sistema
                          </div>
                        ) : (
                          u.category_ids?.length > 0 ? (
                             categories
                              .filter(c => u.category_ids.includes(c.id))
                              .map(c => (
                                <span key={c.id} className="text-[10px] px-3 py-1 rounded-lg bg-noir/50 text-cream/50 border border-white/5 font-medium">
                                  {c.name}
                                </span>
                              ))
                          ) : <span className="text-[10px] text-cream/10 italic">Sin categorías asignadas</span>
                        )}
                      </div>
                   </div>

                   <button 
                    onClick={() => handleEdit(u)}
                    className="w-full h-14 rounded-2xl bg-cream/5 border border-cream/10 text-cream/70 font-bold uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 active:scale-95 transition-all group"
                  >
                    <Save className="w-4 h-4 text-gold group-hover:scale-110 transition-transform" />
                    Gestionar Acceso
                  </button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit User Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="bg-noir/95 backdrop-blur-2xl border-cream/10 text-cream max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif font-bold text-gold">
              {selectedUser?.role === 'admin' ? 'Editar Cuenta de Admin' : 'Editar Cuenta de Staff'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-8 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-6 items-start">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold ml-1 block">Usuario</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/40 text-sm">@</span>
                  <input 
                    className="w-full bg-noir-light border border-white/5 rounded-xl px-9 py-2.5 text-sm focus:outline-none focus:border-gold/30 transition-all font-sans text-cream [&:-webkit-autofill]:shadow-[0_0_0_30px_#0A0A0A_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#F5F5F1]"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold ml-1 block">Password</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold/40" />
                  <input 
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="w-full bg-noir-light border border-white/5 rounded-xl px-11 py-2.5 text-sm focus:outline-none focus:border-gold/30 transition-all font-sans text-cream [&:-webkit-autofill]:shadow-[0_0_0_30px_#0A0A0A_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#F5F5F1]"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-cream/20 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Permissions */}
            {selectedUser?.role === 'staff' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold ml-1">Asignación de Categorías</label>
                   <span className="text-[9px] text-gold/40 italic">Control de privacidad reactivo</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {categories.map(cat => (
                    <div 
                      key={cat.id}
                      onClick={() => toggleCategory(cat.id)}
                      className={`
                        flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group/item
                        ${selectedCats.includes(cat.id) 
                          ? 'border-gold/30 bg-gold/5' 
                          : 'border-white/5 bg-white/[0.02] hover:border-gold/10'}
                      `}
                    >
                      <span className={`text-sm font-sans ${selectedCats.includes(cat.id) ? 'text-gold' : 'text-cream/40 transition-colors group-hover/item:text-cream/60'}`}>
                        {cat.name}
                      </span>
                      <div className={`
                        w-4 h-4 rounded-full border flex items-center justify-center transition-all
                        ${selectedCats.includes(cat.id) ? 'border-gold bg-gold scale-110' : 'border-cream/10'}
                      `}>
                         {selectedCats.includes(cat.id) && <ChevronRight className="w-2.5 h-2.5 text-noir" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {selectedUser?.role === 'admin' && (
              <div className="p-4 rounded-xl bg-gold/5 border border-gold/10 text-center">
                <p className="text-xs text-gold/60 font-serif italic">Esta cuenta tiene acceso absoluto a todas las funciones y datos.</p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-cream/5 pt-4 mt-2">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-cream/30 hover:text-cream transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="bg-gold text-noir px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-gold/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
