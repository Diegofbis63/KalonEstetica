import { useEffect, useState, useRef } from "react";
import ScrollReveal from "./ScrollReveal";
import ServiceCard from "./ServiceCard";
import { ChevronRight, ChevronLeft, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface Service {
  id: string;
  title: string;
  description: string;
  price: string;
  duration: string;
  image_url: string;
}

const ServicesSection = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch('/api/services?active=true');
        if (res.ok) {
          const data = await res.json();
          setServices(data.services || []);
        }
      } catch (e) {
        console.error("Error fetching services:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollContainerRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  if (loading) return (
    <div className="py-20 text-center text-gold/20 font-serif italic">Cargando experiencias premium...</div>
  );

  return (
    <section id="servicios" className="px-4 md:px-8 pb-20 relative overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <div className="flex flex-col md:flex-row items-end justify-between mb-12 gap-6">
            <div className="text-left">
              <p className="text-xs font-sans uppercase tracking-[0.2em] text-gold/60 mb-3">Nuestros Tratamientos</p>
              <h2 className="text-2xl md:text-5xl font-serif font-bold text-cream mb-4">
                Servicios <span className="italic bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent">Premium</span>
              </h2>
              <p className="text-sm text-cream/35 font-sans max-w-md">
                Cada tratamiento es una pieza de arte diseñada para realzar tu belleza natural con resultados de vanguardia.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <button
                  onClick={() => scroll('left')}
                  className="p-3 rounded-full border border-cream/10 bg-noir-light/30 text-cream/40 hover:text-gold hover:border-gold/30 transition-all"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => scroll('right')}
                  className="p-3 rounded-full border border-cream/10 bg-noir-light/30 text-cream/40 hover:text-gold hover:border-gold/30 transition-all"
                  aria-label="Siguiente"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </ScrollReveal>

        <div
          ref={scrollContainerRef}
          className="flex overflow-x-auto gap-6 pb-12 snap-x snap-mandatory scrollbar-hide no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {services.map((s, i) => (
            <div key={s.id} className="min-w-[300px] md:min-w-[380px] snap-start">
              <ScrollReveal delay={i * 0.05} direction="right">
                <ServiceCard
                  name={s.title}
                  price={s.price}
                  duration={s.duration}
                  desc={s.description}
                  image={s.image_url}
                />
              </ScrollReveal>
            </div>
          ))}

          <div className="min-w-[200px] flex items-center justify-center snap-start">
            <motion.a
              href="#chat"
              className="group flex flex-col items-center gap-4 p-8 rounded-2xl border border-gold/10 bg-gold/5 hover:bg-gold/10 transition-all"
              whileHover={{ y: -5 }}
            >
              <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center group-hover:bg-gold transition-colors">
                <ArrowRight className="w-6 h-6 text-gold group-hover:text-noir transition-colors" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-gold">Ver todos</span>
            </motion.a>
          </div>
        </div>

        {/* Visual Cue: Scroll indicator */}
        <div className="flex justify-center mt-4">
          <div className="w-32 h-[1px] bg-cream/5 relative overflow-hidden">
            <motion.div
              className="absolute inset-0 bg-gold/30 w-1/3"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </div>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
};

export default ServicesSection;
