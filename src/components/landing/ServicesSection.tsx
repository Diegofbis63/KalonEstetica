import { useRef } from "react";
import ScrollReveal from "./ScrollReveal";
import CategoryCard from "./CategoryCard";
import { ChevronRight, ChevronLeft, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

import { useQuery } from "@tanstack/react-query";
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface Category {
  id: string;
  name: string;
  description: string;
  image_url: string;
  slug: string;
}

const FALLBACK_CATEGORIES = [
  { name: "Masajes", slug: "masajes", description: "Terapia manual profunda...", image_url: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=800" },
  { name: "Cejas", slug: "cejas", description: "Diseño y perfilado...", image_url: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?q=80&w=800" }
];

const ServicesSection = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Error fetching categories');
      const json = await res.json();
      return json.categories as Category[];
    }
  });

  const categories = data || [];

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
                  className="swiper-button-prev-custom p-3 rounded-full border border-cream/10 bg-noir-light/30 text-cream/40 hover:text-gold hover:border-gold/30 transition-all disabled:opacity-30"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  className="swiper-button-next-custom p-3 rounded-full border border-cream/10 bg-noir-light/30 text-cream/40 hover:text-gold hover:border-gold/30 transition-all disabled:opacity-30"
                  aria-label="Siguiente"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
          </div>
        ) : (
          <Swiper
            modules={[Navigation, Autoplay, Pagination]}
            spaceBetween={30}
            slidesPerView={'auto'}
            navigation={{
              nextEl: '.swiper-button-next-custom',
              prevEl: '.swiper-button-prev-custom',
            }}
            autoplay={{ delay: 4000, disableOnInteraction: false }}
            pagination={{ clickable: true, dynamicBullets: true }}
            className="pb-16 !overflow-visible"
            breakpoints={{
              320: { slidesPerView: 1.2, spaceBetween: 20 },
              640: { slidesPerView: 2.2, spaceBetween: 25 },
              1024: { slidesPerView: 3.5, spaceBetween: 30 },
            }}
          >
            {categories.map((cat, i) => (
              <SwiperSlide key={cat.id || cat.slug} className="h-auto">
                <ScrollReveal delay={i * 0.05} direction="up">
                  <CategoryCard
                    title={cat.name}
                    desc={cat.description || "Explora nuestros tratamientos exclusivos."}
                    image={cat.image_url || "https://images.unsplash.com/photo-1560750588-73207b1ef5b8?q=80&w=800"}
                    slug={cat.slug}
                  />
                </ScrollReveal>
              </SwiperSlide>
            ))}

            <SwiperSlide className="w-auto flex items-center h-auto">
              <motion.a
                href="#chat"
                className="group flex flex-col items-center justify-center gap-4 p-12 h-full min-h-[400px] rounded-3xl border border-gold/10 bg-gold/5 backdrop-blur-sm hover:bg-gold/10 transition-all"
                whileHover={{ y: -5 }}
              >
                <div className="w-16 h-16 rounded-full bg-gold/20 flex items-center justify-center group-hover:bg-gold transition-colors">
                  <ArrowRight className="w-8 h-8 text-gold group-hover:text-noir transition-colors" />
                </div>
                <div className="text-center">
                  <span className="block text-xs uppercase tracking-[0.2em] font-bold text-gold mb-2">Reserva Online</span>
                  <p className="text-sm text-cream/40 font-serif italic">Próximamente más sorpresas</p>
                </div>
              </motion.a>
            </SwiperSlide>
          </Swiper>
        )}
      </div>

      <style>{`
        .swiper-pagination-bullet { background: rgba(212, 175, 55, 0.2); opacity: 1; }
        .swiper-pagination-bullet-active { background: #d4af37; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
};

export default ServicesSection;
