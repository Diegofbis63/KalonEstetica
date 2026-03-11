import { Brain, Shield, Zap } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const features = [
  { icon: Brain, title: "Profesionales Certificados", desc: "Equipo médico con más de 10 años de experiencia en estética avanzada." },
  { icon: Shield, title: "Productos Premium", desc: "Trabajamos con marcas líderes: Allergan, Teoxane, SkinCeuticals." },
  { icon: Zap, title: "Agendamiento Inteligente", desc: "Reserva tu cita 24/7 con nuestra asistente virtual impulsada por IA." },
];

const WhyUsSection = () => {
  return (
    <section className="px-4 md:px-8 pb-20">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-12">
            <p className="text-xs font-sans uppercase tracking-[0.2em] text-gold/60 mb-3">¿Por qué elegirnos?</p>
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-cream">
              Excelencia en cada detalle
            </h2>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <ScrollReveal key={i} delay={i * 0.1}>
              <div className="p-8 rounded-2xl border border-cream/8 bg-noir-light/30 hover:border-gold/20 transition-all duration-500 group text-center">
                <div className="w-14 h-14 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto mb-5 group-hover:bg-gold/15 transition-all">
                  <f.icon className="w-6 h-6 text-gold" />
                </div>
                <h3 className="text-sm font-serif font-semibold text-cream mb-3">{f.title}</h3>
                <p className="text-xs text-cream/40 leading-relaxed font-sans">{f.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyUsSection;
