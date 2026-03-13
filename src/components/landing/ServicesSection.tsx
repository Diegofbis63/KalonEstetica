import { useRef } from "react";
import ScrollReveal from "./ScrollReveal";
import CategoryCard from "./CategoryCard";
import { ChevronRight, ChevronLeft, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const CATEGORIES = [
  {
    title: "Masajes",
    slug: "Masajes",
    desc: "Terapia manual profunda para liberar tensiones corporales.",
    image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=800"
  },
  {
    title: "Cejas",
    slug: "Cejas",
    desc: "Diseño y perfilado personalizado para realzar tu mirada.",
    image: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?q=80&w=800"
  },
  {
    title: "Depilación",
    slug: "Depilacion",
    desc: "Tecnología láser de última generación para una piel suave.",
    image: "https://images.unsplash.com/photo-1559599101-f09722fb4948?q=80&w=800"
  },
  {
    title: "Pestañas",
    slug: "Pestañas",
    desc: "Curvatura y volumen para resaltar tu belleza natural.",
    image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800"
  },
  {
    title: "Corporal",
    slug: "Corporal",
    desc: "Tratamientos reductores y reafirmantes con tecnología Venus.",
    image: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=800"
  },
  {
    title: "Facial",
    slug: "Facial",
    desc: "Limpieza profunda y renovación celular para el rostro.",
    image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=800"
  },
  {
    title: "Uñas",
    slug: "Uñas",
    desc: "Arte y cuidado premium para tus manos y pies.",
    image: "https://images.unsplash.com/photo-1604654894611-6973b376cbde?q=80&w=800"
  }
];

const ServicesSection = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollContainerRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <section id="servicios" className="px-4 md:px-8 pb-20 relative overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <div className="flex flex-col md:flex-row items-end justify-between mb-12 gap-6">
            <div className="text-left">
              <p className="text-xs font-sans uppercase tracking-[0.2em] text-gold/60 mb-3">Descubre KÂLON</p>
              <h2 className="text-2xl md:text-5xl font-serif font-bold text-cream mb-4">
                Experiencias <span className="italic bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent">Premium</span>
              </h2>
              <p className="text-sm text-cream/35 font-sans max-w-md">
                Selecciona una categoría para explorar nuestros tratamientos exclusivos diseñados para tu bienestar.
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
          {CATEGORIES.map((cat, i) => (
            <div key={cat.slug} className="min-w-[280px] md:min-w-[320px] snap-start">
              <ScrollReveal delay={i * 0.05} direction="right">
                <CategoryCard
                  title={cat.title}
                  desc={cat.desc}
                  image={cat.image}
                  slug={cat.slug}
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
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-gold">Reserva Ahora</span>
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
