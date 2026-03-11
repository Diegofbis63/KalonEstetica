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
    <div className="rounded-2xl border border-cream/8 bg-noir-light/50 backdrop-blur-sm hover:border-gold/20 transition-all duration-500 group overflow-hidden h-full flex flex-col">
      <div className="h-48 overflow-hidden relative">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-noir/80 to-transparent opacity-60" />
      </div>
      <div className="p-6 flex flex-col flex-grow">
        <h3 className="text-lg font-serif font-semibold text-cream tracking-wide mb-2 group-hover:text-gold transition-colors">{title}</h3>
        <p className="text-xs text-cream/40 leading-relaxed mb-6 font-sans flex-grow italic">{desc}</p>
        <Link
          to={`/servicios/${slug}`}
          className="flex items-center justify-between w-full text-[10px] font-sans uppercase tracking-[0.2em] text-gold/70 group-hover:text-gold transition-all"
        >
          <span>Explorar Tratamientos</span>
          <div className="w-8 h-8 rounded-full border border-gold/20 flex items-center justify-center group-hover:bg-gold group-hover:text-noir transition-all">
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>
      </div>
    </div>
  );
};

export default CategoryCard;
