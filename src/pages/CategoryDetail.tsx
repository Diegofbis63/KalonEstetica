import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, Clock, Sparkles } from "lucide-react";
import ScrollReveal from "@/components/landing/ScrollReveal";

interface Service {
  id: string;
  title: string;
  description: string;
  price: string;
  duration: string;
  image_url: string;
}

const CATEGORY_METADATA: Record<string, { title: string; image: string }> = {
  "Masajes": { 
    title: "Masajes & Terapias Manuales", 
    image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200" 
  },
  "Cejas": { 
    title: "Diseño y Perfilado de Cejas", 
    image: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?q=80&w=1200" 
  },
  "Depilacion": { 
    title: "Depilación Láser de Vanguardia", 
    image: "https://images.unsplash.com/photo-1559599101-f09722fb4948?q=80&w=1200" 
  },
  "Pestañas": { 
    title: "Pestañas & Mirada Realzada", 
    image: "https://images.unsplash.com/photo-1582213726892-2aa05a3fc551?q=80&w=1200" 
  },
  "Corporal": { 
    title: "Tratamientos Corporales Avanzados", 
    image: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200" 
  },
  "Facial": { 
    title: "Estética Facial & SkinCare", 
    image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200" 
  },
  "Uñas": { 
    title: "Manicura & Pedicura Premium", 
    image: "https://images.unsplash.com/photo-1604654894611-6973b376cbde?q=80&w=1200" 
  },
};

const CategoryDetail = () => {
  const { category } = useParams();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const metadata = CATEGORY_METADATA[category || ""] || { 
    title: category, 
    image: "https://images.unsplash.com/photo-1560750588-73207b1ef5b8?q=80&w=1200" 
  };

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch(`/api/services?active=true&category=${category}`);
        if (res.ok) {
          const data = await res.json();
          setServices(data.services || []);
        }
      } catch (e) {
        console.error("Error fetching category services:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
    window.scrollTo(0, 0);
  }, [category]);

  return (
    <div className="min-h-screen bg-noir text-cream relative selection:bg-gold/30">
      {/* Background with Overlay - Liquid Luxury Tuning */}
      <div className="fixed inset-0 z-0">
        <img 
          src={metadata.image} 
          alt={metadata.title} 
          className="w-full h-full object-cover opacity-60 scale-105 transition-transform duration-[10s] animate-slow-zoom"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-noir" />
        <div className="absolute inset-0 backdrop-blur-[1px]" />
      </div>

      <div className="relative z-10">
        {/* Header Navigation */}
        <header className="px-6 py-8 md:px-12 flex items-center justify-between backdrop-blur-sm sticky top-0 bg-noir/20 border-b border-cream/5">
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
                <Sparkles className="w-3 h-3" /> Catálogo Detallado
              </p>
              <h1 className="text-4xl md:text-6xl font-serif font-bold text-cream mb-6 tracking-tight">
                {metadata.title}
              </h1>
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
                    <div className="group relative p-8 rounded-3xl border border-cream/5 bg-noir-light/40 backdrop-blur-md hover:border-gold/30 hover:bg-noir-light/60 transition-all duration-500">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                        <div className="flex-grow">
                          <h3 className="text-xl font-serif font-bold text-cream mb-2 group-hover:text-gold transition-colors">
                            {s.title}
                          </h3>
                          <div className="flex items-center gap-4 text-[10px] font-sans text-gold/50 uppercase tracking-widest">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3" /> {s.duration}
                            </span>
                          </div>
                        </div>
                        <div className="text-3xl font-serif font-bold text-gold shrink-0 whitespace-nowrap">
                          ${Number(s.price).toLocaleString('es-AR')}
                        </div>
                      </div>
                      
                      <p className="text-sm text-cream/40 leading-relaxed mb-8 font-sans max-w-xl italic">
                        {s.description}
                      </p>

                      <div className="flex items-center justify-end">
                         <Link 
                           to="/#chat"
                           className="px-8 py-3 bg-gold/10 hover:bg-gold text-gold hover:text-noir border border-gold/20 rounded-full text-xs font-sans font-bold uppercase tracking-widest transition-all duration-300"
                         >
                            Reservar Ahora
                         </Link>
                      </div>
                    </div>
                  </ScrollReveal>
                ))
              ) : (
                <div className="col-span-full py-20 text-center">
                   <p className="text-cream/30 font-serif italic">Próximamente más tratamientos en esta categoría...</p>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="py-24 text-center border-t border-cream/5 bg-noir-light/10 backdrop-blur-md mt-20">
           <div className="max-w-xs mx-auto">
             <p className="text-[10px] font-sans text-cream/20 uppercase tracking-[0.5em] mb-10">
                KÂLON MULTIESPACIO ESTETICO
             </p>
             <Link 
               to="/" 
               className="inline-block px-10 py-4 border border-gold/40 text-gold hover:text-gold-light hover:border-gold/60 hover:bg-gold/5 rounded-full text-xs font-sans font-bold uppercase tracking-[0.2em] transition-all duration-300 shadow-lg shadow-gold/5"
             >
                Ver otras categorías
             </Link>
           </div>
        </footer>
      </div>
    </div>
  );
};

export default CategoryDetail;
