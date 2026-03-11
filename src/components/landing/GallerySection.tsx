import ScrollReveal from "./ScrollReveal";
import galleryAfter1 from "@/assets/gallery-after-1.jpg";
import galleryAfter2 from "@/assets/gallery-after-2.jpg";
import galleryAfter3 from "@/assets/gallery-after-3.jpg";
import clinicInterior from "@/assets/clinic-interior.jpg";

const galleryItems = [
  {
    image: galleryAfter1,
    title: "Rejuvenecimiento Facial",
    treatment: "Ácido Hialurónico + Peeling",
    description: "Restauración del volumen facial y textura de piel luminosa en solo 2 sesiones.",
  },
  {
    image: galleryAfter2,
    title: "Diseño de Cejas",
    treatment: "Microblading Hiperrealista",
    description: "Cejas perfectamente definidas con técnica pelo a pelo y pigmentos premium.",
  },
  {
    image: galleryAfter3,
    title: "Labios Naturales",
    treatment: "Relleno con Ácido Hialurónico",
    description: "Volumen sutil y natural que realza la armonía facial.",
  },
];

const GallerySection = () => {
  return (
    <ScrollReveal>
      <section id="galeria" className="px-4 md:px-8 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-sans uppercase tracking-[0.2em] text-gold/60 mb-3">Portfolio</p>
            <h2 className="text-2xl md:text-4xl font-serif font-bold text-cream mb-3">
              Resultados Reales
            </h2>
            <p className="text-sm text-cream/40 font-sans max-w-md mx-auto">
              Transformaciones que hablan por sí solas. Cada resultado refleja nuestro compromiso con la excelencia.
            </p>
          </div>

          {/* Clinic interior */}
          <div className="mb-6 rounded-2xl overflow-hidden border border-cream/8 relative group">
            <img
              src={clinicInterior}
              alt="Interior de KÂLON Multiespacio Estético"
              className="w-full h-64 md:h-80 object-cover group-hover:scale-105 transition-transform duration-700"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-noir via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 md:bottom-8 md:left-8">
              <p className="text-[10px] font-sans text-gold/70 uppercase tracking-[0.2em] mb-1">Nuestras Instalaciones</p>
              <p className="text-sm text-cream font-serif font-semibold">Un espacio diseñado para tu bienestar</p>
            </div>
          </div>

          {/* Results */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {galleryItems.map((item, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <div className="rounded-2xl border border-cream/8 bg-noir-light/50 backdrop-blur-sm overflow-hidden group hover:border-gold/20 transition-all duration-500">
                  <div className="relative h-64 overflow-hidden">
                    <img
                      src={item.image}
                      alt={`Resultado ${item.title}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      loading="lazy"
                    />
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-gold/20 border border-gold/30 backdrop-blur-sm">
                      <span className="text-[10px] font-sans text-gold uppercase tracking-wider">Resultado</span>
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="text-sm font-serif font-semibold text-cream mb-1">{item.title}</h3>
                    <p className="text-[11px] text-gold/60 font-sans mb-2 uppercase tracking-wider">{item.treatment}</p>
                    <p className="text-xs text-cream/35 leading-relaxed font-sans">{item.description}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
};

export default GallerySection;
