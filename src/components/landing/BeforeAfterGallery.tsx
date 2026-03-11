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

const BeforeAfterGallery = () => {
  return (
    <section className="px-4 md:px-8 pb-16">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Resultados Reales
          </h2>
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
            Transformaciones que hablan por sí solas
          </p>
        </div>

        {/* Clinic interior hero */}
        <div className="mb-6 rounded-xl overflow-hidden border border-zinc-800/80 relative group">
          <img
            src={clinicInterior}
            alt="Interior de KÂLON — centro de belleza premium"
            className="w-full h-64 md:h-80 object-cover group-hover:scale-105 transition-transform duration-700"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#030712] via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6">
            <p className="text-[10px] font-mono text-cyan-400/70 uppercase tracking-widest mb-1">Nuestras Instalaciones</p>
            <p className="text-sm text-white font-semibold">Tecnología de última generación en cada tratamiento</p>
          </div>
        </div>

        {/* Results grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {galleryItems.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-sm overflow-hidden group hover:border-cyan-500/20 transition-all duration-500"
            >
              <div className="relative h-64 overflow-hidden">
                <img
                  src={item.image}
                  alt={`Resultado ${item.title} — KÂLON`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                />
                <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-cyan-500/20 border border-cyan-500/30 backdrop-blur-sm">
                  <span className="text-[10px] font-mono text-cyan-300 uppercase">Resultado</span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-[11px] text-cyan-400/70 font-mono mb-2">{item.treatment}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BeforeAfterGallery;
