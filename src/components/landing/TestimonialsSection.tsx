import { Star } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const testimonials = [
  { name: "Valentina M.", text: "El mejor centro de estética al que he ido. El tratamiento de ácido hialurónico quedó increíble y súper natural.", rating: 5 },
  { name: "Carolina R.", text: "Me encanta que puedo agendar por el chat a cualquier hora. La limpieza facial profunda es espectacular.", rating: 5 },
  { name: "Lucía G.", text: "Profesionales de primer nivel. El microblading superó todas mis expectativas. ¡Lo recomiendo 100%!", rating: 5 },
];

const TestimonialsSection = () => {
  return (
    <section className="px-4 md:px-8 pb-20">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-12">
            <p className="text-xs font-sans uppercase tracking-[0.2em] text-gold/60 mb-3">Testimonios</p>
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-cream">
              Lo que dicen nuestras clientas
            </h2>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <ScrollReveal key={i} delay={i * 0.1}>
              <div className="p-6 rounded-2xl border border-cream/8 bg-noir-light/30 hover:border-gold/15 transition-all duration-500">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 text-gold fill-gold" />
                  ))}
                </div>
                <p className="text-sm text-cream/50 leading-relaxed mb-4 font-sans italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold/30 to-rose/30 flex items-center justify-center">
                    <span className="text-[10px] font-serif font-bold text-cream">{t.name[0]}</span>
                  </div>
                  <p className="text-xs text-gold/70 font-sans font-semibold">{t.name}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
