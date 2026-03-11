import { Clock } from "lucide-react";

interface ServiceCardProps {
  name: string;
  price: string;
  duration: string;
  desc: string;
  image: string;
}

const ServiceCard = ({ name, price, duration, desc, image }: ServiceCardProps) => {
  return (
    <div className="rounded-2xl border border-cream/8 bg-noir-light/50 backdrop-blur-sm hover:border-gold/20 transition-all duration-500 group overflow-hidden">
      <div className="h-52 overflow-hidden">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          loading="lazy"
        />
      </div>
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-serif font-semibold text-cream tracking-wide">{name}</h3>
          <span className="text-lg font-serif font-bold text-gold">{price}</span>
        </div>
        <p className="text-xs text-cream/40 leading-relaxed mb-4 font-sans">{desc}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-sans text-gold/50 uppercase tracking-wider">
            <Clock className="w-3 h-3" />
            {duration}
          </div>
          <a
            href="#chat"
            className="text-[10px] font-sans uppercase tracking-wider text-gold/60 hover:text-gold border border-gold/20 rounded-full px-3 py-1 hover:bg-gold/5 transition-all"
          >
            Reservar
          </a>
        </div>
      </div>
    </div>
  );
};

export default ServiceCard;
