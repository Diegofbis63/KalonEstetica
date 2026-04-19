import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, AlertTriangle, Sparkles, Clock, Paperclip, X, FileText } from "lucide-react";
import { streamKalonChat } from "@/lib/kalon-chat";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type Msg = { 
  role: "user" | "assistant"; 
  content: string; 
  media_url?: string;
  media_urls?: string[];
};

type ChatStep = "identifying" | "phone_input" | "chatting";

interface Lead {
  id: string;
  client_name: string;
  contact_info: {
    phone: string;
    source: string;
  };
  current_state?: any;
}

export default function KalonChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ChatStep>("identifying");
  const [phone, setPhone] = useState("");
  const [identifiedLead, setIdentifiedLead] = useState<Lead | null>(null);
  const [currentStage, setCurrentStage] = useState<string>("initial");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  
  // Persistencia de Identidad (Lead ID)
  const [persistentLeadId, setPersistentLeadId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('kalon_lead_id');
  });
  
  const [chatInitId] = useState(() => {
    if (typeof window === 'undefined') return "";
    const saved = sessionStorage.getItem('kalon_chat_init_id');
    if (saved) return saved;
    const newId = crypto.randomUUID();
    sessionStorage.setItem('kalon_chat_init_id', newId);
    return newId;
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Initial welcome message (hardcoded for 0-delay feeling)
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: "¡Hola! Bienvenida/o a KÂLON Estética ✨. Soy tu asistente virtual y estoy acá para ayudarte a reservar un momento especial para vos. Para empezar, ¿me decís tu nombre y apellido? 😊"
      }]);
    }
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = input.trim();
    if ((!content && !selectedFile) || isLoading) return;

    setError(null);
    const userMsg: Msg = { 
      role: "user", 
      content: content || (selectedFile ? "📸 Comprobante adjunto" : ""),
      mediaUrl: previewUrl || undefined,
      media_url: selectedFile ? `https://simulated.com/${selectedFile.name}` : undefined
    };
    
    // Clear inputs immediately for fluid feel
    const mediaToSend = userMsg.media_url;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPreviewUrl(null);
    setSelectedFile(null);
    setIsLoading(true);

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const lastIdx = prev.length - 1;
        if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
          const newMessages = [...prev];
          newMessages[lastIdx] = { 
            ...newMessages[lastIdx], 
            content: assistantSoFar 
          };
          return newMessages;
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    // Use current messages + new one for history
    const history = [...messages, userMsg];

    await streamKalonChat({
      messages: history,
      clientPhone: phone || (identifiedLead?.contact_info?.phone) || undefined,
      identificationId: persistentLeadId || chatInitId,
      mediaUrl: mediaToSend,
      onDelta: (chunk) => upsertAssistant(chunk),
      onIdUpdate: (newId) => {
        console.log("🌸 [KalonChat] Identidad vinculada:", newId);
        setPersistentLeadId(newId);
        sessionStorage.setItem('kalon_lead_id', newId);
      },
      onStage: (s) => setCurrentStage(s),
      onMedia: (url) => setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          const currentUrls = last.media_urls || (last.media_url ? [last.media_url] : []);
          if (!currentUrls.includes(url)) {
            return prev.map((m, idx) => 
              idx === prev.length - 1 ? { ...m, media_urls: [...currentUrls, url], media_url: url } : m
            );
          }
          return prev;
        }
        return [...prev, { role: 'assistant', content: '', media_urls: [url], media_url: url }];
      }),
      onDone: () => setIsLoading(false),
      onError: (err) => {
        setError(err);
        setIsLoading(false);
      },
    });
  };

  const handleFileUpload = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,application/pdf';
    fileInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setSelectedFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        if (!input.trim()) setInput("Adjunto comprobante de pago");
        toast.success(`Comprobante listo: ${file.name}`);
      }
    };
    fileInput.click();
  };

  const checkLead = async () => {
    if (!phone.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leads/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.found) {
        setIdentifiedLead(data.lead);
        setCurrentStage(data.lead.current_state?.stage || null);
        setStep("chatting");
        setMessages([{ 
          role: "assistant", 
          content: `¡Te encontré, **${data.lead.client_name}**! Para tu comodidad, he vinculado esta charla con tu WhatsApp. Podés seguir por acá o por tu celular, ¡como prefieras! 😊` 
        }]);
      } else {
        setStep("chatting");
        setMessages([{ 
          role: "assistant", 
          content: "No encontré una cuenta con ese número, ¡pero no te preocupes! Te trataré como cliente nuevo. ¿En qué puedo ayudarte hoy? ✨" 
        }]);
      }
    } catch (err) {
      setError("Error al validar el teléfono");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[720px] w-full max-w-[850px] mx-auto bg-noir-light/80 backdrop-blur-xl border border-cream/10 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-cream/8 bg-gradient-to-r from-gold/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gold/10 rounded-full border border-gold/20">
            <MessageCircle className="w-4 h-4 text-gold" />
          </div>
          <div>
            <h3 className="text-sm font-serif font-semibold text-cream">Asistente KÂLON</h3>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? "bg-gold-light animate-pulse" : "bg-emerald-400"}`} />
              <span className="text-[10px] text-cream/40 font-sans">{isLoading ? "Procesando..." : "En línea"}</span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => {
            if (confirm("¿Quieres reiniciar la conversación?")) {
              sessionStorage.removeItem('kalon_chat_init_id');
              sessionStorage.removeItem('kalon_lead_id');
              window.location.reload();
            }
          }}
          className="p-2 text-cream/20 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
          title="Reiniciar chat"
        >
          <AlertTriangle className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {step === "identifying" && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <Sparkles className="w-8 h-8 text-gold/60" />
            <div className="space-y-2">
              <h4 className="text-xl font-serif text-cream">¡Bienvenida a KÂLON!</h4>
              <p className="text-xs text-cream/40 font-sans max-w-xs">Dinos si ya has reservado con nosotros antes.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 w-full max-w-xs">
              <button 
                onClick={() => setStep("chatting")}
                className="w-full py-4 rounded-2xl bg-cream/5 border border-cream/10 text-cream text-xs font-bold uppercase tracking-widest hover:bg-cream/10 transition-all font-sans"
              >
                Soy cliente nuevo
              </button>
              <button 
                onClick={() => setStep("phone_input")}
                className="w-full py-4 rounded-2xl bg-gold text-noir text-xs font-bold uppercase tracking-widest transition-all font-sans"
              >
                Ya tengo cuenta
              </button>
            </div>
          </div>
        )}

        {step === "phone_input" && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
             <Clock className="w-8 h-8 text-gold/60" />
            <div className="space-y-2">
              <h4 className="text-xl font-serif text-cream">Recuperar Sesión</h4>
              <p className="text-xs text-cream/40 font-sans max-w-xs px-4">Ingresa tu WhatsApp para recuperar tu historial.</p>
            </div>
            <div className="w-full max-w-xs space-y-3">
              <input 
                type="tel"
                placeholder="Ej: 3512345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-noir border border-white/10 rounded-2xl py-4 px-6 text-sm text-center text-cream outline-none focus:border-gold/50 transition-all"
              />
              <button 
                disabled={isLoading || !phone.trim()}
                onClick={checkLead}
                className="w-full py-4 rounded-2xl bg-gold text-noir text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {isLoading ? "Buscando..." : "Validar Teléfono"}
              </button>
              <button onClick={() => setStep("identifying")} className="text-[10px] uppercase font-bold text-cream/20 hover:text-cream/50 transition-colors">← Volver</button>
            </div>
          </div>
        )}

        {step === "chatting" && messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${m.role === "user" ? "bg-gold/15 border border-gold/20 text-cream" : "bg-cream/5 border border-cream/8 text-cream/70"}`}>
              {/* Renderización de Imágenes (Soporte Multiple) */}
              {((m.media_urls && m.media_urls.length > 0) || m.media_url) && (
                <div className={`grid gap-2 mb-3 ${m.media_urls && m.media_urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {(m.media_urls || [m.media_url]).map((url, idx) => url && (
                    <div key={idx} className="rounded-lg overflow-hidden border border-white/10 bg-noir/20 group relative">
                      <img 
                        src={url} 
                        alt={`Adjunto ${idx + 1}`} 
                        className="w-full h-auto cursor-zoom-in hover:opacity-90 transition-opacity"
                        onClick={() => setZoomImage(url)}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  ))}
                </div>
              )}
              {m.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none chat-bubble-content">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-cream/5 border border-cream/8 px-4 py-2 rounded-2xl flex gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 bg-gold/50 rounded-full" />
              <span className="w-1.5 h-1.5 bg-gold/50 rounded-full" />
              <span className="w-1.5 h-1.5 bg-gold/50 rounded-full" />
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-noir/60 border-t border-cream/8">
        {previewUrl && (
          <div className="mb-2 flex items-center gap-2">
            <div className="relative group rounded-lg border border-gold/30 p-1">
              <img src={previewUrl} className="w-12 h-12 object-cover rounded" />
              <button onClick={() => { setPreviewUrl(null); setSelectedFile(null); }} className="absolute -top-1 -right-1 bg-noir text-cream p-0.5 rounded-full"><X className="w-3 h-3" /></button>
            </div>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2 bg-cream/5 border border-cream/10 rounded-full p-1.5 focus-within:border-gold/30 transition-all">
          <input
            className="flex-1 bg-transparent border-none text-cream text-sm px-4 py-2 outline-none placeholder:text-cream/25 disabled:opacity-50"
            ref={inputRef}
            aria-label="Mensaje"
            value={input}
            placeholder="Escribe aquí..."
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || (!input.trim() && !selectedFile)} className="bg-gold text-noir p-2.5 rounded-full transition-all active:scale-95">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Zoom Modal */}
      {zoomImage && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4" onClick={() => setZoomImage(null)}>
          <img src={zoomImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}
