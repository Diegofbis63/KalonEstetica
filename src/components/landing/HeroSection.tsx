import { motion } from "framer-motion";
import { ChevronRight, Star } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import heroBg from "@/assets/centro-kalon-estetica.png";
import logoKalon from "@/assets/logo kalon sin fondo.png";

const HeroSection = () => {
  return (
    <section className="relative min-h-[85vh] md:min-h-[90vh] flex items-center px-4 overflow-hidden pt-12 md:pt-0">
      <div className="absolute inset-0 -z-10">
        <img
          src={heroBg}
          alt="KÂLON Multiespacio Estético Hero"
          className="w-full h-full object-cover object-[80%] md:object-center opacity-70 md:opacity-100"
        />
        {/* Sophisticated gradient: more intense on mobile to guarantee readability over the image */}
        <div className="absolute inset-0 bg-neutral-950/70 md:bg-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-noir/40 via-transparent to-noir/90 md:bg-gradient-to-r md:from-noir/90 md:via-noir/40 md:to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto w-full relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 items-center min-h-[70vh]">
          {/* Left Column: Content block */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="relative mt-2 lg:mt-0">
              {/* 1. Logo - Positioned to the left of the text on desktop without pushing it */}
              <ScrollReveal delay={0.05} direction="down" className="w-40 sm:w-48 md:w-56 lg:w-[250px] mb-6 lg:mb-0 lg:absolute lg:right-[calc(100%+2rem)] lg:top-0">
                <motion.img 
                  src={logoKalon} 
                  alt="KÂLON Logo" 
                  className="w-full h-auto drop-shadow-[0_5px_15px_rgba(0,0,0,0.3)] mx-auto lg:mx-0"
                  style={{ 
                    filter: "brightness(0) saturate(100%) invert(74%) sepia(13%) saturate(1055%) hue-rotate(338deg) brightness(89%) contrast(85%)"
                  }}
                  animate={{ 
                    y: [0, -5, 0],
                  }}
                  transition={{ 
                    duration: 5, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  }}
                />
              </ScrollReveal>

              {/* 2. Text Content */}
              <div className="space-y-6">
                <ScrollReveal delay={0.1} direction="left">
                  <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-serif font-bold tracking-tight leading-[1.1] drop-shadow-[0_5px_15px_rgba(0,0,0,0.6)]">
                    <span className="text-white block">Tu Belleza,</span>
                    <span className="bg-gradient-to-r from-gold via-gold-light to-gold-light bg-clip-text text-transparent italic">
                      Nuestra Pasión
                    </span>
                  </h1>
                </ScrollReveal>

                <ScrollReveal delay={0.2} direction="left">
                  <p className="text-lg md:text-xl text-white/90 font-sans max-w-xl leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] font-medium">
                    Descubre un espacio donde la ciencia y el arte se unen para realzar
                    tu belleza natural. Tratamientos personalizados con resultados excepcionales.
                  </p>
                </ScrollReveal>
              </div>

              {/* 3. Buttons */}
              <ScrollReveal delay={0.3} direction="up" className="mt-8">
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 md:gap-6">
                  <motion.a
                    href="#chat"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-gradient-to-r from-gold to-gold-light text-noir font-sans font-black px-8 md:px-12 py-4 rounded-full shadow-2xl transition-all text-base tracking-wide"
                    whileHover={{ scale: 1.05, boxShadow: "0 0 35px rgba(212, 175, 55, 0.6)" }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Agendar Cita
                    <ChevronRight className="w-5 h-5" />
                  </motion.a>
                  <motion.a
                    href="#servicios"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white/10 backdrop-blur-xl border border-white/20 hover:border-gold/60 text-white px-8 md:px-12 py-4 rounded-full transition-all text-base font-sans font-bold shadow-xl shadow-noir/40"
                    whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.2)" }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Ver Tratamientos
                  </motion.a>
                </div>
              </ScrollReveal>
            </div>
          </div>

          {/* Right Column: Empty to show the background image */}
          <div className="hidden lg:block h-full" />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
