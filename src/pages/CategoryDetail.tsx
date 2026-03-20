
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, Clock, Sparkles, Star } from "lucide-react";
import ScrollReveal from "@/components/landing/ScrollReveal";
import { useQuery } from "@tanstack/react-query";
import { 
  safeFetch, 
  CategoriesResponseSchema, 
  ServicesResponseSchema,
} from "@/lib/validations";

const ServiceRow = ({ service, isLast }: { service: any; isLast: boolean }) => {
  return (
    <div className={`group/row relative flex items-center justify-between p-6 md:p-8 transition-all duration-300 hover:bg-white/[0.02] ${!isLast ? 'border-b border-white/5' : ''}`}>
      <div className="flex-grow pr-8">
        <h3 className="text-lg md:text-xl font-sans font-medium text-white mb-1 group-hover/row:text-gold transition-colors">
          {service.title}
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-cream/40 uppercase tracking-widest font-sans">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-gold/40" /> {service.duration} min
          </span>
          {service.description && (
            <>
              <span className="w-1 h-1 rounded-full bg-white/10" />
              <span className="line-clamp-1 italic normal-case tracking-normal">{service.description}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 md:gap-12 shrink-0">
        <div className="text-right">
          <div className="text-xl md:text-2xl font-serif font-bold text-gold">
            ${Number(service.price).toLocaleString('es-AR')}
          </div>
          <p className="text-[9px] text-white/20 uppercase tracking-widest mt-0.5">ARS</p>
        </div>

        <Link 
          to="/#chat"
          className="px-6 py-2.5 rounded-full border border-gold/20 text-gold text-[10px] font-sans font-bold uppercase tracking-widest hover:bg-gold hover:text-noir transition-all active:scale-95 whitespace-nowrap"
        >
          Reservar
        </Link>
      </div>
    </div>
  );
};

const CategoryDetail = () => {
  const { category: slug } = useParams();

  // Fetch Category Metadata
  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ['category', slug],
    queryFn: async () => {
      const data = await safeFetch(`/api/categories?slug=${slug}`, CategoriesResponseSchema, { categories: [] });
      return data.categories[0] || null;
    }
  });

  // Fetch Category Services
  const { data: svcData, isLoading: svcLoading } = useQuery({
    queryKey: ['services', slug],
    queryFn: async () => {
      const data = await safeFetch(`/api/services?active=true&categorySlug=${slug}`, ServicesResponseSchema, { services: [] });
      return data.services;
    }
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const category = catData;
  const services = (svcData || []) as any[];
  const loading = catLoading || svcLoading;

  if (!loading && !category) {
    return (
      <div className="min-h-screen bg-noir flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl font-serif text-gold mb-4">Categoría no encontrada</h1>
        <Link to="/" className="text-cream/50 underline">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-noir text-cream relative selection:bg-gold/30 overflow-x-hidden">
      {/* Background with Overlay */}
      <div className="fixed inset-0 z-0">
        <img 
          src={category?.image_url || "https://images.unsplash.com/photo-1560750588-73207b1ef5b8?q=80&w=1200"} 
          alt={category?.name} 
          className="w-full h-full object-cover opacity-60 scale-105 transition-transform duration-[10s] animate-slow-zoom"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-noir" />
        <div className="absolute inset-0 backdrop-blur-[1px]" />
      </div>

      <div className="relative z-10">
        {/* Header Navigation */}
        <header className="px-6 py-8 md:px-12 flex items-center justify-between backdrop-blur-sm sticky top-0 bg-noir/20 border-b border-cream/5 z-50">
          <Link to="/" className="group flex items-center gap-2 text-xs font-sans uppercase tracking-[0.2em] text-cream/60 hover:text-gold transition-all">
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Volver al inicio</span>
          </Link>
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center border border-gold/20">
               <span className="text-gold font-serif font-bold text-sm">K</span>
             </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <ScrollReveal>
            <div className="mb-16">
              <p className="text-xs font-sans uppercase tracking-[0.3em] text-gold/60 mb-4 flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Tratamientos Exclusivos
              </p>
              <h1 className="text-4xl md:text-7xl font-serif font-bold text-cream mb-6 tracking-tight">
                {category?.name}
              </h1>
              <p className="text-lg text-cream/60 font-sans max-w-2xl italic mb-8">
                {category?.description}
              </p>
              <div className="w-24 h-1 bg-gold rounded-full" />
            </div>
          </ScrollReveal>

          {loading ? (
             <div className="max-w-4xl mx-auto space-y-4">
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="h-24 w-full bg-white/[0.02] rounded-3xl animate-pulse border border-white/5" />
                ))}
             </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-12 pb-20">
              {services.length > 0 ? (
                (() => {
                  const shouldGroup = services.length > 10;
                  
                  if (!shouldGroup) {
                    return (
                      <ScrollReveal>
                        <div className="bg-noir-light/30 backdrop-blur-xl rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
                          {services.map((s, i) => (
                            <ServiceRow key={s.id} service={s} isLast={i === services.length - 1} />
                          ))}
                        </div>
                      </ScrollReveal>
                    );
                  }

                  // Advanced Dynamic Grouping
                  const groupDefinitions = [
                    { name: "Tratamientos Femeninos", keywords: ['fem', 'mujer', 'dama'] },
                    { name: "Tratamientos Masculinos", keywords: ['masc', 'hombre', 'caballero'] },
                    { name: "Promociones & Combos", keywords: ['combo', 'pack', 'promo', 'clásico'] }
                  ];

                  const categorizedIds = new Set<string>();
                  const groupedData = groupDefinitions.map(def => {
                    const items = services.filter(s => {
                      const match = def.keywords.some(k => s.title.toLowerCase().includes(k));
                      if (match) categorizedIds.add(s.id);
                      return match;
                    });
                    return { name: def.name, items };
                  });

                  // Catch-all group
                  const others = services.filter(s => !categorizedIds.has(s.id));
                  if (others.length > 0) {
                    groupedData.push({ name: "Otros Servicios", items: others });
                  }

                  return groupedData.map((group, idx) => {
                    if (group.items.length === 0) return null;
                    return (
                      <ScrollReveal key={group.name} delay={idx * 0.1}>
                        <div className="space-y-6">
                          <div className="flex items-center gap-4 px-4">
                            <h2 className="text-xl font-serif font-bold text-gold/80 italic tracking-wide">{group.name}</h2>
                            <div className="h-[1px] flex-grow bg-gradient-to-r from-gold/20 via-gold/5 to-transparent" />
                          </div>
                          <div className="bg-noir-light/30 backdrop-blur-xl rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
                            {group.items.map((s, i) => (
                              <ServiceRow key={s.id} service={s} isLast={i === group.items.length - 1} />
                            ))}
                          </div>
                        </div>
                      </ScrollReveal>
                    );
                  });
                })()
              ) : (
                <div className="py-24 text-center bg-noir-light/20 backdrop-blur-md rounded-3xl border border-cream/5">
                   <div className="w-16 h-16 bg-gold/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-gold/10">
                     <Sparkles className="w-8 h-8 text-gold-light opacity-30" />
                   </div>
                   <p className="text-cream/40 font-serif italic text-lg mb-2">Estamos renovando nuestro catálogo</p>
                   <p className="text-cream/20 font-sans text-xs uppercase tracking-widest">Próximamente más tratamientos en esta categoría</p>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="py-24 text-center border-t border-cream/5 bg-noir-light/5 backdrop-blur-xl mt-20">
           <div className="max-w-md mx-auto px-6">
             <div className="w-12 h-[1px] bg-gold/30 mx-auto mb-8" />
             <p className="text-[10px] font-sans text-cream/20 uppercase tracking-[0.5em] mb-12">
                KÂLON MULTIESPACIO ESTETICO — CÓRDOBA
             </p>
             <Link 
               to="/" 
               className="group inline-flex items-center gap-4 px-12 py-5 border border-gold/30 text-gold hover:text-gold-light hover:border-gold/60 hover:bg-gold/5 rounded-full text-[11px] font-sans font-bold uppercase tracking-[0.3em] transition-all duration-500 shadow-2xl shadow-gold/5"
             >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-2 transition-transform" />
                Explorar otras Categorías
             </Link>
           </div>
        </footer>
      </div>
      
      <style>{`
        @keyframes slow-zoom {
          from { transform: scale(1.05); }
          to { transform: scale(1.15); }
        }
        .animate-slow-zoom {
          animation: slow-zoom 20s linear infinite alternate;
        }
      `}</style>
    </div>
  );
};

export default CategoryDetail;
