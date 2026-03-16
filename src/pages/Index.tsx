import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import KalonChat from "@/components/KalonChat";
import ScrollReveal from "@/components/landing/ScrollReveal";
import HeroSection from "@/components/landing/HeroSection";
import ServicesSection from "@/components/landing/ServicesSection";
import GallerySection from "@/components/landing/GallerySection";
import WhyUsSection from "@/components/landing/WhyUsSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import FloatingChat from "@/components/FloatingChat";
import { LogIn, MapPin, Phone, Instagram, Clock, Mail, Menu, X, MessageCircle } from "lucide-react";

const Index = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [isMobileMenuOpen]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-noir text-cream relative overflow-hidden">
      {/* Subtle warm ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gold/[0.04] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-rose/[0.03] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 pt-20 md:pt-24">
        {/* Header - Fixed & Glassmorphism */}
        <header
          className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 md:px-12 py-4 transition-all duration-300 ${isScrolled || isMobileMenuOpen
            ? "bg-noir backdrop-blur-md shadow-lg border-b border-cream/5 py-3"
            : "bg-transparent py-6"
            }`}
        >
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={scrollToTop}
            role="button"
            aria-label="Volver al inicio"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center transition-transform group-hover:scale-110" role="img">
              <span className="text-noir font-serif font-bold text-lg">K</span>
            </div>
            <div>
              <span className="text-xl font-serif font-bold tracking-[0.15em] text-cream">
                KÂLON
              </span>
              <p className="text-[11px] font-sans text-cream/60 tracking-[0.2em] uppercase">Multiespacio Estético</p>
            </div>
          </div>
          <nav className="flex items-center gap-4 md:gap-6">
            <div className="hidden md:flex items-center gap-6">
              <a href="#servicios" className="text-[11px] text-cream/50 hover:text-gold transition-colors font-sans uppercase tracking-[0.15em]">
                Servicios
              </a>
              <a href="#galeria" className="text-[11px] text-cream/50 hover:text-gold transition-colors font-sans uppercase tracking-[0.15em]">
                Resultados
              </a>
              <a href="#chat" className="text-[11px] text-cream/50 hover:text-gold transition-colors font-sans uppercase tracking-[0.15em]">
                Agendar
              </a>
            </div>
            <Link
              to="/auth"
              className="hidden sm:flex items-center gap-2 text-[10px] md:text-xs font-sans text-gold/70 hover:text-gold border border-gold/20 rounded-full px-3 md:px-4 py-1.5 hover:bg-gold/5 transition-all"
            >
              <LogIn className="w-3 md:w-3.5 h-3 md:h-3.5" />
              <span>Dashboard</span>
            </Link>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 text-cream/60 hover:text-gold transition-colors relative z-[110]"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </nav>

          {/* Mobile Overlay Menu */}
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed inset-0 z-[105] md:hidden bg-noir pt-24 px-8 flex flex-col gap-8 transition-all h-screen overflow-y-auto"
            >
              <a
                href="#servicios"
                className="text-2xl font-serif text-cream hover:text-gold transition-colors border-b border-cream/5 pb-4"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Servicios
              </a>
              <a
                href="#galeria"
                className="text-2xl font-serif text-cream hover:text-gold transition-colors border-b border-cream/5 pb-4"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Resultados
              </a>
              <a
                href="#chat"
                className="text-2xl font-serif text-cream hover:text-gold transition-colors border-b border-cream/5 pb-4"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Agendar
              </a>
              <Link
                to="/auth"
                className="text-2xl font-serif text-gold hover:text-gold-light transition-colors flex items-center gap-3"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <LogIn className="w-6 h-6" />
                Acceso Dashboard
              </Link>
            </motion.div>
          )}
        </header>

        <HeroSection />

        {/* Info bar */}
        <ScrollReveal className="px-6 my-12 md:my-16">
          <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 text-cream/80 text-[15px] font-sans font-medium">
            <a 
              href="https://www.google.com/maps/search/?api=1&query=Miguel+de+Cervantes+708,+Córdoba,+Argentina+-31.389794,-64.184034" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-3 justify-center md:justify-start hover:text-amber-500 transition-colors group"
            >
              <MapPin className="w-5 h-5 text-gold shrink-0 group-hover:scale-110 transition-transform" />
              <span className="text-center md:text-left">Miguel de Cervantes 708, Córdoba</span>
            </a>
            
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <Clock className="w-5 h-5 text-gold shrink-0" />
              <span className="text-center md:text-left">Lun–Sáb 9:00–20:00</span>
            </div>

            <a 
              href="https://wa.me/5493513975114" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-3 justify-center md:justify-start hover:text-amber-500 transition-colors group"
            >
              <MessageCircle className="w-5 h-5 text-gold shrink-0 group-hover:scale-110 transition-transform" />
              <span className="text-center md:text-left">+54 9 3513 97-5114</span>
            </a>

            <a 
              href="https://www.instagram.com/kalon.multiespacio.estetico/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-3 justify-center md:justify-start hover:text-amber-500 transition-colors group"
            >
              <Instagram className="w-5 h-5 text-gold shrink-0 group-hover:scale-110 transition-transform" />
              <span className="text-center md:text-left">@kalon.multiespacio.estetico</span>
            </a>
          </div>
        </ScrollReveal>

        <ServicesSection />
        <GallerySection />
        <WhyUsSection />
        <TestimonialsSection />

        {/* Chat CTA */}
        <ScrollReveal>
          <section id="chat" className="px-4 pb-8">
            <div className="text-center mb-8">
              <p className="text-xs font-sans uppercase tracking-[0.2em] text-gold/60 mb-3">Reserva Online</p>
              <h2 className="text-2xl md:text-3xl font-serif font-bold mb-3 text-cream">
                Agenda tu cita ahora
              </h2>
              <p className="text-sm text-cream/40 font-sans max-w-md mx-auto">
                Habla con nuestra asistente virtual. Disponible las 24 horas, los 7 días de la semana.
              </p>
            </div>
            <KalonChat />
          </section>
        </ScrollReveal>

        {/* Footer */}
        <footer className="border-t border-cream/10 mt-8">
          <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
            <div>
              <h4 className="font-serif text-lg font-bold text-cream mb-4">KÂLON</h4>
              <p className="text-sm text-cream/50 leading-relaxed font-sans">
                Multiespacio Estético premium con los mejores profesionales y tecnología de última generación en Córdoba.
              </p>
            </div>
            <div>
              <h4 className="font-serif text-lg font-bold text-cream mb-4">Contacto</h4>
              <div className="space-y-3 text-sm text-cream/50 font-sans">
                <a href="https://www.google.com/maps/search/?api=1&query=Miguel+de+Cervantes+708,+Córdoba,+Argentina+-31.389794,-64.184034" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center md:justify-start gap-3 hover:text-gold transition-colors">
                  <MapPin className="w-4 h-4 text-gold/60" /> Miguel de Cervantes 708, Córdoba
                </a>
                <a href="https://wa.me/5493513975114" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center md:justify-start gap-3 hover:text-gold transition-colors">
                  <MessageCircle className="w-4 h-4 text-gold/60" /> +54 9 3513 97-5114
                </a>
                <a href="mailto:hola@kalonestetica.com" className="flex items-center justify-center md:justify-start gap-3 hover:text-gold transition-colors">
                  <Mail className="w-4 h-4 text-gold/60" /> hola@kalonestetica.com
                </a>
              </div>
            </div>
            <div>
              <h4 className="font-serif text-lg font-bold text-cream mb-4">Horarios</h4>
              <div className="space-y-2 text-sm text-cream/50 font-sans">
                <p className="flex items-center justify-center md:justify-start gap-2"><Clock className="w-4 h-4 text-gold/60" /> Lun–Sáb: 9:00 – 20:00</p>
                <p className="flex items-center justify-center md:justify-start gap-2 text-rose/60"><Clock className="w-4 h-4 opacity-50" /> Domingos: Cerrado</p>
              </div>
            </div>
          </div>
          <div className="text-center py-6 border-t border-cream/5">
            <p className="text-[10px] font-sans text-cream/20 uppercase tracking-[0.3em]">
              © 2026 KÂLON MULTIESPACIO ESTETICO — Todos los derechos reservados
            </p>
          </div>
        </footer>
        <FloatingChat />
      </div>
    </div>
  );
};

export default Index;
