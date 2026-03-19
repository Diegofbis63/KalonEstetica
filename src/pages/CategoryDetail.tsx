
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

interface Service {
  id: string;
  title: string;
  description: string;
  price: string;
  duration: string;
  image_url: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  image_url: string;
  slug: string;
}

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
  const services = svcData || [];
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
             <div className="flex items-center justify-center py-20">
                <div className="w-10 h-10 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
             </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              {services.length > 0 ? (
                services.map((s, i) => (
                  <ScrollReveal key={s.id} delay={i * 0.1}>
                    <div className="group relative p-8 md:p-10 rounded-[2rem] border border-cream/5 bg-noir-light/40 backdrop-blur-md hover:border-gold/30 hover:bg-noir-light/60 transition-all duration-500 shadow-2xl shadow-black/50 overflow-hidden">
                      {/* Decorative elements */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gold/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-gold/10 transition-colors" />
                      
                      <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                        <div className="flex-grow">
                          <div className="flex items-center gap-2 mb-3">
                            <Star className="w-3 h-3 text-gold fill-gold opacity-50" />
                            <span className="text-[9px] uppercase tracking-[0.3em] text-gold/40 font-bold">Recommended</span>
                          </div>
                          <h3 className="text-2xl font-serif font-bold text-cream mb-3 group-hover:text-gold transition-colors tracking-wide">
                            {s.title}
                          </h3>
                          <div className="flex items-center gap-4 text-[10px] font-sans text-gold/60 uppercase tracking-widest">
                            <span className="flex items-center gap-2 bg-noir/40 px-3 py-1.5 rounded-full border border-gold/10">
                              <Clock className="w-3 h-3" /> {s.duration}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="text-3xl md:text-4xl font-serif font-bold text-gold shrink-0 whitespace-nowrap mb-1">
                            ${Number(s.price).toLocaleString('es-AR')}
                          </div>
                          <span className="text-[9px] text-cream/20 uppercase tracking-widest">ARS Final</span>
                        </div>
                      </div>
                      
                      <p className="relative z-10 text-[15px] text-cream/45 leading-relaxed mb-10 font-sans max-w-xl">
                        {s.description}
                      </p>

                      <div className="relative z-10 flex items-center justify-between">
                         <div className="flex -space-x-2">
                           {[1,2,3].map(i => (
                             <div key={i} className="w-8 h-8 rounded-full border-2 border-noir bg-noir-light flex items-center justify-center overflow-hidden">
                               <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="User" className="w-full h-full object-cover grayscale opacity-50" />
                             </div>
                           ))}
                           <div className="px-3 flex items-center text-[10px] text-cream/30 font-sans">
                             +150 turnos este mes
                           </div>
                         </div>
                         <Link 
                           to="/#chat"
                           className="group/btn relative px-8 py-4 overflow-hidden rounded-full transition-all duration-300 transform active:scale-95"
                         >
                            <div className="absolute inset-0 bg-gold translate-y-[101%] group-hover/btn:translate-y-0 transition-transform duration-300" />
                            <div className="absolute inset-0 bg-gold/10 group-hover/btn:bg-transparent border border-gold/20 transition-all rounded-full" />
                            <span className="relative z-10 text-gold group-hover/btn:text-noir text-xs font-sans font-bold uppercase tracking-widest">
                               Reservar Turno
                            </span>
                         </Link>
                      </div>
                    </div>
                  </ScrollReveal>
                ))
              ) : (
                <div className="col-span-full py-24 text-center bg-noir-light/20 backdrop-blur-md rounded-3xl border border-cream/5">
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
