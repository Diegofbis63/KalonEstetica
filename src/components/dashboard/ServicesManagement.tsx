import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  GripVertical, 
  Edit, 
  Trash2, 
  ChevronRight, 
  Image as ImageIcon,
  Save,
  X,
  Upload,
  Clock,
  DollarSign
} from 'lucide-react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// --- Types ---

interface Category {
  id: string;
  name: string;
  description: string;
  image_url: string;
  sort_order: number;
}

interface Service {
  id: string;
  category_id: string;
  title: string;
  description: string;
  price: string;
  duration: string;
  image_url: string;
  sort_order: number;
  active: boolean;
}

// --- Sortable Item Components ---

const SortableCategoryItem = ({ 
  category, 
  isActive, 
  onClick 
}: { 
  category: Category; 
  isActive: boolean; 
  onClick: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
        isActive 
          ? 'bg-gold/10 border-gold/30 text-gold shadow-lg shadow-gold/5' 
          : 'bg-noir-light/30 border-cream/5 text-cream/60 hover:border-cream/10 hover:bg-noir-light/50'
      } ${isDragging ? 'opacity-50' : ''}`}
      onClick={onClick}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:text-gold transition-colors">
        <GripVertical className="w-4 h-4 opacity-40 group-hover:opacity-100" />
      </div>
      <span className="flex-grow font-serif font-bold text-sm truncate">{category.name}</span>
      <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? 'translate-x-1 opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
    </div>
  );
};

const SortableServiceItem = ({ 
  service, 
  onEdit, 
  onDelete 
}: { 
  service: Service; 
  onEdit: () => void; 
  onDelete: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: service.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-4 p-4 rounded-xl border bg-noir-light/20 border-cream/5 hover:border-gold/20 transition-all ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-cream/20 hover:text-gold transition-colors">
        <GripVertical className="w-5 h-5" />
      </div>
      
      <div className="flex-grow">
        <h4 className="text-cream font-serif font-bold group-hover:text-gold transition-colors">{service.title}</h4>
        <div className="flex items-center gap-4 mt-1">
          <span className="text-xs text-gold/60 font-medium">${Number(service.price).toLocaleString('es-AR')}</span>
          <span className="text-[10px] text-cream/30 uppercase tracking-widest">{service.duration}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button 
          onClick={onEdit}
          className="p-2 rounded-lg bg-cream/5 text-cream/40 hover:text-gold hover:bg-gold/10 transition-all"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button 
          onClick={onDelete}
          className="p-2 rounded-lg bg-rose/5 text-cream/40 hover:text-rose hover:bg-rose/10 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function ServicesManagement() {
  const queryClient = useQueryClient();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  
  // Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);

  // Queries
  const { data: catData, isLoading: catsLoading } = useQuery<{ categories: Category[] }>({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/categories').then(res => res.json())
  });

  const { data: servData, isLoading: servsLoading } = useQuery<{ services: Service[] }>({
    queryKey: ['services', activeCategoryId],
    queryFn: () => fetch(`/api/services?category_id=${activeCategoryId}`).then(res => res.json()),
    enabled: !!activeCategoryId
  });

  // Mutations
  const reorderCategoriesMutation = useMutation({
    mutationFn: (reorder: { id: string, sort_order: number }[]) => 
      fetch('/api/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  });

  const reorderServicesMutation = useMutation({
    mutationFn: (reorder: { id: string, sort_order: number }[]) => 
      fetch('/api/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', activeCategoryId] })
  });

  const saveCategoryMutation = useMutation({
    mutationFn: (cat: Partial<Category>) => 
      fetch('/api/categories', {
        method: cat.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cat)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsCategoryModalOpen(false);
      toast.success("Categoría guardada");
    }
  });

  const saveServiceMutation = useMutation({
    mutationFn: (svc: Partial<Service>) => 
      fetch('/api/services', {
        method: svc.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...svc, category_id: activeCategoryId })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', activeCategoryId] });
      setIsServiceModalOpen(false);
      toast.success("Servicio guardado");
    }
  });

  const deleteServiceMutation = useMutation({
      mutationFn: (id: string) => fetch(`/api/services?id=${id}`, { method: 'DELETE' }),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['services', activeCategoryId] });
          toast.success("Servicio eliminado");
      }
  });

  // DND Handlers
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!catData || !over || active.id === over.id) return;

    const oldIndex = catData.categories.findIndex(c => c.id === active.id);
    const newIndex = catData.categories.findIndex(c => c.id === over.id);

    const newOrder = arrayMove(catData.categories, oldIndex, newIndex);
    queryClient.setQueryData(['categories'], { categories: newOrder });

    const reorderData = newOrder.map((c, i) => ({ id: c.id, sort_order: i }));
    reorderCategoriesMutation.mutate(reorderData);
  };

  const handleServiceDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!servData || !over || active.id === over.id) return;

    const oldIndex = servData.services.findIndex(s => s.id === active.id);
    const newIndex = servData.services.findIndex(s => s.id === over.id);

    const newOrder = arrayMove(servData.services, oldIndex, newIndex);
    queryClient.setQueryData(['services', activeCategoryId], { services: newOrder });

    const reorderData = newOrder.map((s, i) => ({ id: s.id, sort_order: i }));
    reorderServicesMutation.mutate(reorderData);
  };

  const activeCategory = catData?.categories.find(c => c.id === activeCategoryId);

  // Set first category as active on load
  React.useEffect(() => {
    if (catData?.categories.length && !activeCategoryId) {
      setActiveCategoryId(catData.categories[0].id);
    }
  }, [catData, activeCategoryId]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[600px]">
      
      {/* --- Sidebar: Categories --- */}
      <div className="w-full lg:w-72 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-sans uppercase tracking-[0.2em] text-cream/40 font-bold">Categorías</h3>
          <button 
            onClick={() => { setEditingCategory({}); setIsCategoryModalOpen(true); }}
            className="p-1.5 rounded-lg bg-gold/10 text-gold hover:bg-gold hover:text-noir transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {catsLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-12 bg-noir-light/30 rounded-xl animate-pulse" />)}
            </div>
        ) : (
          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragEnd={handleCategoryDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={catData?.categories.map(c => c.id) || []} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {catData?.categories.map(cat => (
                  <SortableCategoryItem 
                    key={cat.id} 
                    category={cat} 
                    isActive={activeCategoryId === cat.id}
                    onClick={() => setActiveCategoryId(cat.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* --- Content: Category Detail + Services --- */}
      <div className="flex-grow flex flex-col gap-8">
        {activeCategory ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            
            {/* Category Header/Edit */}
            <div className="p-8 rounded-2xl border border-cream/5 bg-noir-light/20 relative overflow-hidden mb-8">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl -mr-32 -mt-32" />
                
                <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
                  <div className="w-full md:w-48 h-32 rounded-xl overflow-hidden border border-cream/10 bg-noir group relative">
                    {activeCategory.image_url ? (
                      <img src={activeCategory.image_url} alt="" className="w-full h-full object-cover opacity-60" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-cream/10"><ImageIcon className="w-8 h-8" /></div>
                    )}
                    <button 
                        onClick={() => { setEditingCategory(activeCategory); setIsCategoryModalOpen(true); }}
                        className="absolute inset-0 bg-noir/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 text-xs font-bold text-gold transition-all"
                    >
                        <Edit className="w-4 h-4" /> Editar Imagen
                    </button>
                  </div>

                  <div className="flex-grow">
                     <div className="flex items-center justify-between mb-4">
                        <h2 className="text-3xl font-serif font-bold text-cream group-hover:text-gold transition-colors">{activeCategory.name}</h2>
                        <button 
                            onClick={() => { setEditingCategory(activeCategory); setIsCategoryModalOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cream/5 text-cream/60 hover:text-gold hover:bg-gold/10 border border-transparent hover:border-gold/20 transition-all text-xs font-bold uppercase tracking-widest"
                        >
                            <Edit className="w-3.5 h-3.5" /> Editar Categoría
                        </button>
                     </div>
                     <p className="text-sm text-cream/40 font-sans leading-relaxed italic max-w-2xl">
                        {activeCategory.description || "Sin descripción establecida."}
                     </p>
                  </div>
                </div>
            </div>

            {/* Services List */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-gold rounded-full" />
                        <h3 className="text-lg font-serif font-bold text-cream tracking-tight">Tratamientos en {activeCategory.name}</h3>
                    </div>
                    <button 
                        onClick={() => { setEditingService({ active: true }); setIsServiceModalOpen(true); }}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-gold text-noir text-xs font-bold uppercase tracking-widest hover:shadow-lg hover:shadow-gold/10 hover:-translate-y-0.5 transition-all"
                    >
                        <Plus className="w-4 h-4" /> Agregar Tratamiento
                    </button>
                </div>

                {servsLoading ? (
                    <div className="space-y-4">
                        {[1,2,3].map(i => <div key={i} className="h-20 bg-noir-light/20 rounded-xl animate-pulse" />)}
                    </div>
                ) : (
                    <DndContext 
                        sensors={sensors} 
                        collisionDetection={closestCenter} 
                        onDragEnd={handleServiceDragEnd}
                        modifiers={[restrictToVerticalAxis]}
                    >
                        <SortableContext items={servData?.services.map(s => s.id) || []} strategy={verticalListSortingStrategy}>
                            <div className="space-y-3">
                                {servData?.services.map(svc => (
                                    <SortableServiceItem 
                                        key={svc.id} 
                                        service={svc}
                                        onEdit={() => { setEditingService(svc); setIsServiceModalOpen(true); }}
                                        onDelete={() => {
                                            if (confirm("¿Estás seguro de eliminar este tratamiento?")) {
                                                deleteServiceMutation.mutate(svc.id);
                                            }
                                        }}
                                    />
                                ))}
                                {servData?.services.length === 0 && (
                                    <div className="py-16 text-center border-2 border-dashed border-cream/5 rounded-2xl">
                                        <p className="text-cream/20 font-serif italic text-lg">No hay tratamientos en esta categoría aún.</p>
                                    </div>
                                )}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

          </div>
        ) : (
          <div className="flex-grow flex items-center justify-center text-cream/10">
            <p className="font-serif italic text-2xl">Selecciona una categoría para comenzar</p>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* Category Modal */}
      <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
        <DialogContent className="bg-noir border border-gold/20 text-cream max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-gold">{editingCategory?.id ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30">Nombre</label>
                <Input 
                    value={editingCategory?.name || ''} 
                    onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                    className="bg-noir-light border-cream/10 focus:border-gold/30"
                />
            </div>
            <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30">Descripción (SEO/Contexto)</label>
                <Textarea 
                    value={editingCategory?.description || ''} 
                    onChange={e => setEditingCategory({ ...editingCategory, description: e.target.value })}
                    rows={4}
                    className="bg-noir-light border-cream/10 focus:border-gold/30 resize-none"
                />
            </div>
            <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30">Imagen de Fondo (URL)</label>
                <div className="flex gap-3">
                    <Input 
                        value={editingCategory?.image_url || ''} 
                        onChange={e => setEditingCategory({ ...editingCategory, image_url: e.target.value })}
                        className="bg-noir-light border-cream/10 focus:border-gold/30"
                        placeholder="https://images.unsplash.com/..."
                    />
                    <button className="p-3 rounded-lg bg-cream/5 hover:bg-gold/10 text-cream/40 hover:text-gold transition-all border border-cream/10">
                        <Upload className="w-4 h-4" />
                    </button>
                </div>
            </div>
          </div>
          <DialogFooter>
            <button 
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-6 py-2.5 rounded-xl border border-cream/10 text-cream/60 hover:bg-cream/5 transition-all text-xs font-bold uppercase tracking-widest"
            >
                Cancelar
            </button>
            <button 
                onClick={() => saveCategoryMutation.mutate(editingCategory!)}
                disabled={saveCategoryMutation.isPending}
                className="px-8 py-2.5 rounded-xl bg-gold text-noir font-bold flex items-center gap-2 hover:shadow-lg hover:shadow-gold/20 transition-all text-xs uppercase tracking-widest"
            >
                <Save className="w-4 h-4" /> {saveCategoryMutation.isPending ? 'Guardando...' : 'Guardar Datos'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service Modal */}
      <Dialog open={isServiceModalOpen} onOpenChange={setIsServiceModalOpen}>
        <DialogContent className="bg-noir border border-gold/20 text-cream max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-gold">{editingService?.id ? 'Editar Tratamiento' : 'Nuevo Tratamiento'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30">Título del Servicio</label>
                <Input 
                    value={editingService?.title || ''} 
                    onChange={e => setEditingService({ ...editingService, title: e.target.value })}
                    className="bg-noir-light border-cream/10"
                />
            </div>
            <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30">Descripción (IA Context)</label>
                <Textarea 
                    value={editingService?.description || ''} 
                    onChange={e => setEditingService({ ...editingService, description: e.target.value })}
                    className="bg-noir-light border-cream/10"
                />
            </div>
            <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30">Precio (ARS)</label>
                <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gold/40" />
                    <Input 
                        value={editingService?.price || ''} 
                        onChange={e => setEditingService({ ...editingService, price: e.target.value })}
                        className="bg-noir-light border-cream/10 pl-9 text-gold font-bold"
                    />
                </div>
            </div>
            <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cream/30">Duración</label>
                <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/20" />
                    <Input 
                        value={editingService?.duration || ''} 
                        onChange={e => setEditingService({ ...editingService, duration: e.target.value })}
                        className="bg-noir-light border-cream/10 pl-9"
                    />
                </div>
            </div>
          </div>
          <DialogFooter>
            <button 
                onClick={() => setIsServiceModalOpen(false)}
                className="px-6 py-2.5 rounded-xl border border-cream/10 text-cream/60"
            >
                Cancelar
            </button>
            <button 
                onClick={() => saveServiceMutation.mutate(editingService!)}
                disabled={saveServiceMutation.isPending}
                className="px-8 py-2.5 rounded-xl bg-gold text-noir font-bold text-xs uppercase tracking-widest"
            >
                {saveServiceMutation.isPending ? 'Guardando...' : 'Guardar Tratamiento'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
