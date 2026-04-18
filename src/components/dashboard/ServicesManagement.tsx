import React, { useState, useRef } from 'react';
import { useAuth } from '@/components/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  safeFetch, 
  CategoriesResponseSchema, 
  ServicesResponseSchema,
  Category,
  Service
} from "@/lib/validations";
import { 
  DollarSign,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Edit,
  GripVertical,
  ChevronRight,
  ImageIcon,
  X,
  Upload,
  Save,
  Clock,
  Sparkles,
  Eye
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

// --- Sortable Item Components ---

const SortableCategoryItem = ({ 
  category, 
  isActive, 
  onClick,
  onDelete,
  onGenerate,
  isGenerating = false,
  isReadOnly = false
}: { 
  category: Category; 
  isActive: boolean; 
  onClick: () => void;
  onDelete: () => void;
  onGenerate: () => void;
  isGenerating?: boolean;
  isReadOnly?: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.id, disabled: isReadOnly });

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
      {!isReadOnly && (
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:text-gold transition-colors">
          <GripVertical className="w-4 h-4 opacity-40 group-hover:opacity-100" />
        </div>
      )}
      <span className="flex-grow font-serif font-bold text-sm truncate">{category.name}</span>
      {!isReadOnly && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            disabled={isGenerating}
            onClick={(e) => { e.stopPropagation(); onGenerate(); }}
            title="Generar Imagen de Precios"
            className={`p-2 rounded-xl transition-all flex items-center gap-1.5 ${
              category.price_list_url 
                ? 'bg-gold/10 text-gold border border-gold/20' 
                : 'bg-white/5 text-cream/40 border border-white/5 hover:border-gold/30 hover:text-gold'
            }`}
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span className="text-[8px] font-black uppercase tracking-tighter hidden sm:inline">Generar Lista</span>
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 rounded-xl bg-rose-500/5 text-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500 transition-all border border-rose-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? 'translate-x-1 opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
    </div>
  );
};

const SortableServiceItem = ({ 
  service, 
  onEdit, 
  onDelete,
  isReadOnly = false
}: { 
  service: Service; 
  onEdit: () => void; 
  onDelete: () => void;
  isReadOnly?: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: service.id, disabled: isReadOnly });

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
      {!isReadOnly && (
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-cream/20 hover:text-gold transition-colors">
          <GripVertical className="w-5 h-5" />
        </div>
      )}
      
      <div className="flex-grow">
        <h4 className="text-cream font-serif font-bold group-hover:text-gold transition-colors">{service.title}</h4>
        <div className="flex items-center gap-4 mt-1">
          <span className="text-xs text-gold font-bold whitespace-nowrap">${(Number(service.price) || 0).toLocaleString('es-AR')}</span>
          <span className="text-[10px] text-cream/30 uppercase tracking-widest">{service.duration}</span>
        </div>
      </div>

      {!isReadOnly && (
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
      )}
    </div>
  );
};

// --- Main Component ---

export default function ServicesManagement() {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'staff';
  const queryClient = useQueryClient();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Imagen demasiado grande (máx 1.5MB para almacenamiento directo)");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (editingCategory) {
        setEditingCategory(prev => prev ? { ...prev, image_url: base64 } : null);
      }
      setIsUploading(false);
      toast.success("Imagen cargada localmente");
    };
    reader.onerror = () => {
      setIsUploading(false);
      toast.error("Error al procesar la imagen");
    };
    reader.readAsDataURL(file);
  };
  
  // Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);


  // Queries
  const { data: catData, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => safeFetch('/api/categories', CategoriesResponseSchema, { categories: [] }),
    staleTime: 60000,
    retry: 3,
  });

  const { data: servData, isLoading: servsLoading } = useQuery({
    queryKey: ['services', activeCategoryId],
    queryFn: () => safeFetch(`/api/services?category_id=${activeCategoryId}`, ServicesResponseSchema, { services: [] }),
    enabled: !!activeCategoryId,
    staleTime: 60000,
    retry: 3,
  });

  // Auto-select first category
  React.useEffect(() => {
    if (catData?.categories?.length && !activeCategoryId) {
      setActiveCategoryId(catData.categories[0].id);
    }
  }, [catData, activeCategoryId]);


  // Mutations
  const reorderCategoriesMutation = useMutation({
    mutationFn: (reorder: { id: string, sort_order: number }[]) => 
      fetch('/api/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder, type: 'category' })
      }),
    onMutate: async (newOrder) => {
      await queryClient.cancelQueries({ queryKey: ['categories'] });
      const previousCats = queryClient.getQueryData<{ categories: Category[] }>(['categories']);
      if (previousCats) {
        // Optimistically update
        const updatedCats = [...previousCats.categories];
        newOrder.forEach(item => {
          const idx = updatedCats.findIndex(c => c.id === item.id);
          if (idx !== -1) updatedCats[idx].sort_order = item.sort_order;
        });
        updatedCats.sort((a, b) => a.sort_order - b.sort_order);
        queryClient.setQueryData(['categories'], { categories: updatedCats });
      }
      return { previousCats };
    },
    onError: (err, newOrder, context) => {
      if (context?.previousCats) {
        queryClient.setQueryData(['categories'], context.previousCats);
      }
      toast.error('Error al reordenar');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  });

  const reorderServicesMutation = useMutation({
    mutationFn: (reorder: { id: string, sort_order: number }[]) => 
      fetch('/api/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder, type: 'service' })
      }),
    onMutate: async (newOrder) => {
      await queryClient.cancelQueries({ queryKey: ['services', activeCategoryId] });
      const previousServs = queryClient.getQueryData<{ services: Service[] }>(['services', activeCategoryId]);
      if (previousServs) {
        const updatedServs = [...previousServs.services];
        newOrder.forEach(item => {
          const idx = updatedServs.findIndex(s => s.id === item.id);
          if (idx !== -1) updatedServs[idx].sort_order = item.sort_order;
        });
        updatedServs.sort((a, b) => a.sort_order - b.sort_order);
        queryClient.setQueryData(['services', activeCategoryId], { services: updatedServs });
      }
      return { previousServs };
    },
    onError: (err, newOrder, context) => {
      if (context?.previousServs) {
        queryClient.setQueryData(['services', activeCategoryId], context.previousServs);
      }
      toast.error('Error al reordenar servicios');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['services', activeCategoryId] })
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

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/categories?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success("Categoría eliminada");
      setActiveCategoryId(null);
    }
  });

  const deleteServiceMutation = useMutation({
      mutationFn: (id: string) => fetch(`/api/services?id=${id}`, { method: 'DELETE' }),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['services', activeCategoryId] });
          toast.success("Servicio eliminado");
      }
  });

  const { data: configData } = useQuery({
    queryKey: ['config'],
    queryFn: () => fetch('/api/admin?section=config').then(res => res.json())
  });

  const mainCatalogUrl = configData?.configs?.find((c: any) => c.key === 'MAIN_CATALOG_IMAGE_URL')?.value;

  const saveConfigMutation = useMutation({
    mutationFn: (config: { key: string, value: string }) => 
      fetch('/api/admin?section=config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
    }
  });

  const generateMainCatalogMutation = useMutation({
    mutationFn: async () => {
      if (!catData?.categories) return null;
      
      const items = catData.categories
        .filter(c => c.active !== false)
        .map(c => ({
          label: c.name,
          price: "Ver Mas" // Or some generic text
        }));

      if (items.length === 0) throw new Error("No hay categorías activas.");

      const response = await fetch('/api/satori-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: "Nuestras Especialidades",
          data: btoa(unescape(encodeURIComponent(JSON.stringify(items))))
        })
      });
      
      if (!response.ok) throw new Error("Error al generar imagen maestra");
      
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },
    onSuccess: async (base64) => {
      if (!base64) return;
      await saveConfigMutation.mutateAsync({ key: 'MAIN_CATALOG_IMAGE_URL', value: base64 });
      toast.success("Catálogo Maestro de Especialidades actualizado");
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al generar catálogo");
    }
  });

  const generatePriceListMutation = useMutation({
    mutationFn: async (category: Category) => {
      // 1. Prepare data
      const items = (category.services || [])
        .filter(s => s.active)
        .map(s => ({
          label: s.title,
          price: Number(s.price).toLocaleString('es-AR')
        }));

      if (items.length === 0) throw new Error("La categoría no tiene servicios activos.");

      // 2. Call Satori via POST (to avoid URL length limits)
      const response = await fetch('/api/satori-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: category.name,
          data: btoa(unescape(encodeURIComponent(JSON.stringify(items))))
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Error al generar imagen");
      }
      
      const blob = await response.blob();
      
      // 3. Convert to Base64 for DB storage
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },
    onSuccess: async (base64, category) => {
      // 4. Save to DB
      await fetch(`/api/categories?id=${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...category, price_list_url: base64 })
      });

      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(`Imagen de lista de precios generada para ${category.name}`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al generar imagen");
    }
  });

  // DND Handlers
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
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

  const activeCategory = catData?.categories?.find(c => c.id === activeCategoryId);

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
        {/* Main Catalog Generation Button */}
        {!isReadOnly && (
          <div className={`p-4 rounded-2xl border transition-all ${mainCatalogUrl ? 'bg-gold/5 border-gold/20' : 'bg-noir-light/30 border-white/5'}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-gold">Catálogo Maestro</span>
              {generateMainCatalogMutation.isPending && <Loader2 className="w-3 h-3 animate-spin text-gold" />}
            </div>
            {mainCatalogUrl ? (
              <div className="flex gap-3 items-center">
                <div 
                  className="w-12 h-16 rounded-lg overflow-hidden border border-gold/20 cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => { setPreviewUrl(mainCatalogUrl); setIsPreviewModalOpen(true); }}
                >
                  <img src={mainCatalogUrl} alt="Main Catalog" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col gap-1">
                   <button 
                    onClick={() => generateMainCatalogMutation.mutate()}
                    className="text-[9px] font-bold text-gold/60 hover:text-gold flex items-center gap-1 transition-colors"
                   >
                     <Sparkles className="w-3 h-3" /> Actualizar
                   </button>
                   <button 
                    onClick={() => { setPreviewUrl(mainCatalogUrl); setIsPreviewModalOpen(true); }}
                    className="text-[9px] font-bold text-cream/40 hover:text-cream flex items-center gap-1 transition-colors"
                   >
                     <Eye className="w-3 h-3" /> Ver Imagen
                   </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => generateMainCatalogMutation.mutate()}
                className="w-full py-3 rounded-xl bg-gold/10 text-gold border border-gold/20 hover:bg-gold hover:text-noir font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <Sparkles className="w-4 h-4" /> Generar Catálogo Principal
              </button>
            )}
            <p className="text-[9px] text-cream/30 mt-3 leading-relaxed">
              Esta imagen es la que el bot enviará cuando un cliente nuevo se registre.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-sans uppercase tracking-[0.2em] text-cream/40 font-bold">Categorías Individuales</h3>
          {!isReadOnly && (
            <button 
              onClick={() => { setEditingCategory({}); setIsCategoryModalOpen(true); }}
              className="p-1.5 rounded-lg bg-gold/10 text-gold hover:bg-gold hover:text-noir transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
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
            <SortableContext items={catData?.categories?.map(c => c.id) || []} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {catData?.categories?.map(cat => (
                  <SortableCategoryItem 
                    key={cat.id} 
                    category={cat} 
                    isActive={activeCategoryId === cat.id}
                    onClick={() => setActiveCategoryId(cat.id)}
                    onDelete={() => {
                        if (confirm(`¿Estás seguro de eliminar la categoría "${cat.name}"? Se perderán todos sus servicios.`)) {
                            deleteCategoryMutation.mutate(cat.id);
                        }
                    }}
                    onGenerate={() => generatePriceListMutation.mutate(cat)}
                    isGenerating={generatePriceListMutation.isPending && generatePriceListMutation.variables?.id === cat.id}
                    isReadOnly={isReadOnly}
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
            <div className="p-5 sm:p-8 rounded-2xl border border-cream/5 bg-noir-light/20 relative overflow-hidden mb-8">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl -mr-32 -mt-32" />
                
                <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
                  <div className="w-full md:w-48 h-32 rounded-xl overflow-hidden border border-cream/10 bg-noir group relative">
                    {activeCategory.image_url ? (
                      <img src={activeCategory.image_url} alt="" className="w-full h-full object-cover opacity-60" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-cream/10"><ImageIcon className="w-8 h-8" /></div>
                    )}
                    {!isReadOnly && (
                      <button 
                          onClick={() => { setEditingCategory(activeCategory); setIsCategoryModalOpen(true); }}
                          className="absolute inset-0 bg-noir/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 text-xs font-bold text-gold transition-all"
                      >
                          <Edit className="w-4 h-4" /> Editar Imagen
                      </button>
                    )}
                  </div>

                  <div className="flex-grow">
                     <div className="flex items-center justify-between mb-4">
                        <h2 className="text-3xl font-serif font-bold text-cream group-hover:text-gold transition-colors">{activeCategory.name}</h2>
                        <div className="flex items-center gap-2">
                          {activeCategory.price_list_url && (
                             <button 
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewUrl(activeCategory.price_list_url!); setIsPreviewModalOpen(true); }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 text-gold hover:bg-gold/20 border border-gold/20 transition-all text-[10px] font-bold uppercase tracking-widest"
                             >
                                <Eye className="w-3.5 h-3.5" /> Ver Lista
                             </button>
                          )}
                          {!isReadOnly && (
                            <button 
                                onClick={() => { setEditingCategory(activeCategory); setIsCategoryModalOpen(true); }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cream/5 text-cream/60 hover:text-gold hover:bg-gold/10 border border-transparent hover:border-gold/20 transition-all text-[10px] font-bold uppercase tracking-widest"
                            >
                                <Edit className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                        </div>
                     </div>
                     <p className="text-sm text-cream/40 font-sans leading-relaxed italic max-w-2xl mb-6">
                        {activeCategory.description || "Sin descripción establecida."}
                     </p>

                     {activeCategory.price_list_url && (
                       <div className="flex items-center gap-4 p-4 rounded-xl bg-noir border border-cream/5 animate-in fade-in slide-in-from-top-2">
                          <div 
                            className="w-16 h-20 rounded-lg overflow-hidden border border-cream/10 bg-noir-light flex-shrink-0 cursor-pointer hover:border-gold/30 transition-all"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewUrl(activeCategory.price_list_url!); setIsPreviewModalOpen(true); }}
                          >
                             <img src={activeCategory.price_list_url} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-grow">
                             <div className="text-[10px] uppercase tracking-widest text-gold font-bold mb-1">Imagen de Satori Detectada</div>
                             <div className="text-xs text-cream/40 leading-snug">Esta imagen es la que se enviará a los clientes vía WhatsApp.</div>
                          </div>
                          {!isReadOnly && (
                            <button 
                              onClick={() => {
                                if (confirm("¿Estás seguro de eliminar esta lista de precios? Tendrás que generarla de nuevo.")) {
                                  // Update to null
                                  fetch(`/api/categories?id=${activeCategory.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ...activeCategory, price_list_url: null })
                                  }).then(() => queryClient.invalidateQueries({ queryKey: ['categories'] }));
                                }
                              }}
                              className="p-2 text-cream/20 hover:text-rose transition-colors"
                              title="Eliminar Lista de Precios"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                       </div>
                     )}
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
                    {!isReadOnly && (
                      <button 
                          onClick={() => { setEditingService({ active: true }); setIsServiceModalOpen(true); }}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-gold text-noir text-xs font-bold uppercase tracking-widest hover:shadow-lg hover:shadow-gold/10 hover:-translate-y-0.5 transition-all"
                      >
                          <Plus className="w-4 h-4" /> Agregar Tratamiento
                      </button>
                    )}
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
                        <SortableContext items={servData?.services?.map(s => s.id) || []} strategy={verticalListSortingStrategy}>
                            <div className="space-y-3">
                                {servData?.services?.map(svc => (
                                    <SortableServiceItem 
                                        key={svc.id} 
                                        service={svc}
                                        isReadOnly={isReadOnly}
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
                <label className="text-[10px] uppercase tracking-widest text-cream/30 font-bold">Imagen de Fondo (Banner)</label>
                <div className="flex gap-4 items-center p-4 rounded-xl bg-noir-light border border-cream/10">
                    {editingCategory?.image_url ? (
                      <div className="relative group w-24 h-24 rounded-lg overflow-hidden border border-gold/20 flex-shrink-0 bg-noir">
                        <img src={editingCategory.image_url} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => setEditingCategory({ ...editingCategory, image_url: '' })}
                          className="absolute inset-0 bg-rose/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        >
                          <X className="w-5 h-5 text-white" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-lg border-2 border-dashed border-cream/10 flex flex-col items-center justify-center gap-2 text-cream/20">
                        <ImageIcon className="w-6 h-6" />
                        <span className="text-[8px] uppercase font-bold">Sin Foto</span>
                      </div>
                    )}
                    
                    <div className="flex-1 flex flex-col gap-2">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        className="hidden" 
                        accept="image/*" 
                      />
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gold/10 text-gold hover:bg-gold hover:text-noir transition-all border border-gold/20 text-[10px] font-bold uppercase tracking-widest"
                      >
                        {isUploading ? (
                          <div className="w-4 h-4 border-2 border-noir border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {editingCategory?.image_url ? 'Cambiar Imagen' : 'Seleccionar Archivo'}
                      </button>
                      
                      {!editingCategory?.image_url && (
                        <p className="text-[9px] text-cream/20 italic text-center">Formatos sugeridos: JPG, PNG, WebP (Máx 1.5MB)</p>
                      )}
                    </div>
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
                <label className="text-[10px] uppercase tracking-widest text-cream/30">Descripción (Contexto Bot)</label>
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

      {/* Image Preview Modal (WhatsApp Style) */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="p-0 bg-transparent border-none max-w-[95vw] shadow-none">
            <div className="relative w-full h-full flex items-center justify-center p-4">
                <button 
                    onClick={() => setIsPreviewModalOpen(false)}
                    className="absolute top-4 right-4 z-50 p-3 rounded-full bg-noir/50 backdrop-blur-md text-white border border-white/10 hover:bg-gold hover:text-noir transition-all"
                >
                    <X className="w-6 h-6" />
                </button>
                {previewUrl && (
                    <div className="bg-noir/90 backdrop-blur-xl p-2 rounded-2xl border border-cream/10 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
                        <img 
                            src={previewUrl} 
                            alt="Lista de Precios" 
                            className="max-h-[85vh] w-auto object-contain rounded-xl" 
                        />
                        <div className="mt-4 pb-2 text-center">
                            <p className="text-[10px] uppercase tracking-[0.3em] text-gold font-bold">Kâlon Estética • Lista de Precios</p>
                            <p className="text-[8px] text-cream/30 mt-1">Legible para clientes vía WhatsApp</p>
                        </div>
                    </div>
                )}
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
