import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface CategoryCardProps {
  title: string;
  desc: string;
  image: string;
  slug: string;
}

const CategoryCard = ({ title, desc, image, slug }: CategoryCardProps) => {
  return (
    <div className="rounded-3xl border border-white/5 bg-noir-light/40 backdrop-blur-md hover:border-gold/30 hover:shadow-[0_0_30px_-5px_rgba(212,175,55,0.15)] transition-all duration-500 group overflow-hidden h-full flex flex-col group/card relative">
      <div className="aspect-[4/5] overflow-hidden relative">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-1000 ease-out"
          loading="lazy"
        />
        {/* Soft overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-noir via-noir/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />
        
        {/* Card Name Overlay */}
        <div className="absolute bottom-6 left-6 right-6">
          <h3 className="text-2xl font-serif font-bold text-cream tracking-tight mb-1 group-hover/card:text-gold transition-colors">{title}</h3>
          <p className="text-[10px] text-cream/40 leading-relaxed font-sans line-clamp-2 italic uppercase tracking-wider">{desc}</p>
        </div>
      </div>
      
      <div className="p-6 pt-0 mt-auto">
        <Link
          to={`/servicios/${slug}`}
          className="flex items-center justify-between w-full text-[10px] font-sans uppercase tracking-[0.2em] text-gold/60 group-hover/card:text-gold transition-all pt-4 border-t border-white/5"
        >
          <span className="font-bold flex items-center gap-2">
            Explorar Tratamientos
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          </span>
          <div className="w-10 h-10 rounded-full border border-gold/10 flex items-center justify-center group-hover/card:bg-gold group-hover/card:text-noir transition-all transform group-hover/card:rotate-[-45deg]">
            <ArrowRight className="w-5 h-5 shadow-sm" />
          </div>
        </Link>
      </div>
    </div>
  );
};

export default CategoryCard;
