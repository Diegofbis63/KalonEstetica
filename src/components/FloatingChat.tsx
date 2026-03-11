import { MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function FloatingChat() {
    const scrollToChat = () => {
        const section = document.getElementById('chat');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <AnimatePresence>
            <motion.button
                onClick={scrollToChat}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="fixed bottom-6 right-6 z-50 p-4 rounded-full bg-gradient-to-br from-gold to-gold-light text-noir shadow-2xl shadow-gold/20 border border-gold/30 md:hidden"
                aria-label="Ir al chat de agendamiento"
            >
                <MessageCircle className="w-6 h-6" />
            </motion.button>
        </AnimatePresence>
    );
}
