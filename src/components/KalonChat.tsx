import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, AlertTriangle, Sparkles, Clock, Paperclip, X, FileText } from "lucide-react";
import { streamKalonChat } from "@/lib/kalon-chat";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type Msg = { 
  role: "user" | "assistant"; 
  content: string; 
  mediaUrl?: string;
  media_url?: string;
};

type ChatStep = "identifying" | "phone_input" | "chatting";

interface Lead {
  id: string;
  client_name: string;
  contact_info: {
    phone: string;
    source: string;
  };
  current_state?: unknown;
}

export default function KalonChat() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "¡Hola! Bienvenida/o a KÂLON Estética ✨. Soy tu asistente virtual y estoy acá para ayudarte a reservar un momento especial para vos. Para empezar, ¿me decís tu nombre y apellido? 😊"
    }
  ]);
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
  const [chatInitId] = useState(() => {
    if (typeof window === 'undefined') return "";
    const saved = sessionStorage.getItem('kalon_chat_init_id');
    if (saved) return saved;
    const newId = crypto.randomUUID();
    sessionStorage.setItem('kalon_chat_init_id', newId);
    return newId;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!isLoading && initialized.current) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    if (messages.length === 0 && !isLoading) {
      triggerInitialGreeting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerInitialGreeting = async () => {
    setIsLoading(true);
    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    await streamKalonChat({
      messages: [{ role: 'user', content: 'Hola, quiero reservar una cita' }],
      clientPhone: phone || undefined,
      identificationId: chatInitId,
      onDelta: (chunk) => upsertAssistant(chunk),
      onStage: (s) => setCurrentStage(s),
      onMedia: (url) => setMessages(prev => {
        const last = prev[prev.length-1];
        if (last?.role === 'assistant') {
          return prev.map((m, idx) => idx === prev.length-1 ? { ...m, media_url: url } : m);
        }
        return [...prev, { role: 'assistant', content: '', media_url: url }];
      }),
      onDone: () => setIsLoading(false),
      onError: (err) => {
        setError(err);
        setIsLoading(false);
      },
    });
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
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

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
    
    // Captured for API call
    const mediaToSend = userMsg.media_url;

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    
    // Clear preview - WE DON'T REVOKE YET because we want it visible in the chat bubble
    // URL.revokeObjectURL(previewUrl); 
    setPreviewUrl(null);
    setSelectedFile(null);
    
    setIsLoading(true);

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    await streamKalonChat({
      messages: [...messages, userMsg],
      clientPhone: phone || (identifiedLead?.contact_info?.phone) || undefined,
      identificationId: chatInitId,
      mediaUrl: mediaToSend,
      onDelta: (chunk) => upsertAssistant(chunk),
      onStage: (s) => setCurrentStage(s),
      onMedia: (url) => setMessages(prev => {
        const last = prev[prev.length-1];
        if (last?.role === 'assistant') {
          return prev.map((m, idx) => idx === prev.length-1 ? { ...m, media_url: url } : m);
        }
        return [...prev, { role: 'assistant', content: '', media_url: url }];
      }),
      onDone: () => {
        setIsLoading(false);
        initialized.current = true;
      },
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
        
        // If input is empty, put a default text
        if (!input.trim()) {
          setInput("Adjunto comprobante de pago");
        }
        
        toast.success(`Comprobante listo: ${file.name}`);
      }
    };
    fileInput.click();
  };

  const removePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    if (input === "Adjunto comprobante de pago") {
      setInput("");
    }
  };

  return (
    <div
      className="flex flex-col h-[720px] w-full max-w-[850px] mx-auto bg-noir-light/80 backdrop-blur-xl border border-cream/10 rounded-2xl overflow-hidden shadow-2xl"
      role="region"
      aria-label="Chat de agendamiento KÂLON"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-cream/8 bg-gradient-to-r from-gold/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gold/10 rounded-full border border-gold/20">
            <MessageCircle className="w-4 h-4 text-gold" />
          </div>
          <div>
            <h3 className="text-sm font-serif font-semibold text-cream">
              Asistente KÂLON
            </h3>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full animate-pulse ${isLoading ? "bg-gold-light" : "bg-emerald-400"
                  }`}
              />
              <span className="text-[10px] text-cream/40 font-sans">
                {isLoading ? "Escribiendo..." : "En línea"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4"
      >
        {step === "identifying" && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="p-4 rounded-full border border-gold/15 bg-gold/5">
              <Sparkles className="w-8 h-8 text-gold/60" />
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-serif text-cream">¡Bienvenida a KÂLON!</h4>
              <p className="text-xs text-cream/40 font-sans max-w-xs px-4">
                Para brindarte una mejor experiencia, dinos si ya has reservado con nosotros antes.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 w-full max-w-xs">
              <button 
                onClick={() => {
                  setStep("chatting");
                  triggerInitialGreeting();
                }}
                className="w-full py-4 rounded-2xl bg-cream/5 border border-cream/10 text-cream text-xs font-bold uppercase tracking-widest hover:bg-cream/10 transition-all font-sans"
              >
                Soy cliente nuevo
              </button>
              <button 
                onClick={() => setStep("phone_input")}
                className="w-full py-4 rounded-2xl bg-gold text-noir text-xs font-bold uppercase tracking-widest hover:scale-[1.02] transition-all font-sans"
              >
                Ya tengo cuenta / Soy recurrente
              </button>
            </div>
          </div>
        )}

        {step === "phone_input" && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
             <div className="p-4 rounded-full border border-gold/15 bg-gold/5">
              <Clock className="w-8 h-8 text-gold/60" />
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-serif text-cream">Recuperar Sesión</h4>
              <p className="text-xs text-cream/40 font-sans max-w-xs px-4">
                Ingresa tu número de WhatsApp (con código de área) para recuperar tu historial y carrito.
              </p>
            </div>
            <div className="w-full max-w-xs space-y-3">
              <input 
                type="tel"
                placeholder="Ej: 3512345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-noir border border-white/10 rounded-2xl py-4 px-6 text-sm text-center outline-none focus:border-gold/50 transition-all font-sans"
              />
              <button 
                disabled={isLoading || !phone.trim()}
                onClick={checkLead}
                className="w-full py-4 rounded-2xl bg-gold text-noir text-xs font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 font-sans"
              >
                {isLoading ? "Buscando..." : "Validar Teléfono"}
              </button>
              <button 
                onClick={() => setStep("identifying")}
                className="text-[10px] uppercase font-bold text-cream/20 hover:text-cream/50 transition-colors tracking-widest"
              >
                ← Volver atrás
              </button>
            </div>
          </div>
        )}

        {step === "chatting" && messages.length === 0 && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="p-4 rounded-full border border-gold/15 bg-gold/5">
              <MessageCircle className="w-8 h-8 text-gold/40" />
            </div>
            <div>
              <p className="text-sm font-serif text-cream/60 mb-1">¡Hola! Soy tu asistente</p>
              <p className="text-xs text-cream/30 font-sans max-w-xs">
                Pregúntame sobre nuestros tratamientos, precios o agenda tu cita directamente aquí.
              </p>
            </div>
          </div>
        )}

        {step === "chatting" && messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
            className={`max-w-[95%] px-4 py-3 rounded-2xl text-sm leading-relaxed font-sans ${m.role === "user"
                ? "bg-gold/15 border border-gold/20 text-cream rounded-tr-sm"
                : `bg-cream/5 border border-cream/8 text-cream/70 rounded-tl-sm ${m.content.includes('\n*') || m.content.includes('\n-') ? 'chat-bubble-list-container' : ''}`
                }`}
            >
              {(m.mediaUrl || m.media_url) && (
                <div className="mb-2 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                  {(m.mediaUrl || m.media_url)?.toLowerCase().includes('.pdf') ? (
                    <div className="bg-noir/60 p-4 flex items-center gap-3">
                      <FileText className="w-8 h-8 text-gold" />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gold uppercase font-bold tracking-widest">Documento</span>
                        <span className="text-xs text-cream/80 truncate max-w-[150px]">Comprobante.pdf</span>
                      </div>
                    </div>
                  ) : (
                    <img 
                      src={m.mediaUrl || m.media_url} 
                      alt="Adjunto" 
                      className="max-w-full h-auto max-h-[500px] object-contain mx-auto rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setZoomImage(m.mediaUrl || m.media_url || null)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                </div>
              )}
              {m.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 chat-bubble-content">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-cream/5 border border-cream/8 px-4 py-3 rounded-2xl flex gap-1.5">
              <div className="w-2 h-2 bg-gold/50 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gold/50 rounded-full animate-bounce [animation-delay:0.15s]" />
              <div className="w-2 h-2 bg-gold/50 rounded-full animate-bounce [animation-delay:0.3s]" />
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2 font-sans">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-noir/60 border-t border-cream/8">
        {/* Preview Area */}
        {previewUrl && (
          <div className="mb-3 flex items-start gap-3 relative animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="relative group overflow-hidden rounded-xl border border-gold/30 bg-gold/5 p-1">
              {selectedFile?.type.startsWith('image/') ? (
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="w-20 h-20 object-cover rounded-lg"
                />
              ) : (
                <div className="w-20 h-20 flex flex-col items-center justify-center gap-1 text-gold/60">
                  <FileText className="w-8 h-8" />
                  <span className="text-[8px] font-bold uppercase truncate max-w-full px-1">
                    {selectedFile?.name.split('.').pop()}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={removePreview}
                className="absolute top-1 right-1 p-1 bg-noir/80 text-cream hover:bg-destructive hover:text-white rounded-full transition-all shadow-lg opacity-0 group-hover:opacity-100"
                title="Quitar archivo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 pt-1">
              <p className="text-[10px] text-cream/40 font-bold uppercase tracking-widest mb-0.5">Archivo seleccionado</p>
              <p className="text-xs text-cream/80 font-medium truncate max-w-[200px]">{selectedFile?.name}</p>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSend}
          className="flex items-center gap-3 bg-cream/5 border border-cream/10 rounded-full p-1.5 focus-within:border-gold/30 transition-all duration-300"
        >
          { (currentStage === 'payment_request' || currentStage === 'ask_for_deposit' || currentStage === 'waiting_for_receipt') && (
            <button
              type="button"
              onClick={handleFileUpload}
              className="p-2 ml-1 text-gold hover:bg-gold/10 rounded-full transition-colors group"
              title="Subir comprobante"
            >
              <Paperclip className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            </button>
          )}
          <input
            className="flex-1 bg-transparent border-none text-cream text-sm px-4 py-1.5 focus:outline-none focus:ring-0 placeholder:text-cream/25 disabled:opacity-50 font-sans"
            ref={inputRef}
            aria-label="Escribe tu mensaje para el asistente"
            value={input}
            placeholder="Escribe tu mensaje..."
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            aria-label="Enviar mensaje"
            disabled={isLoading || (!input.trim() && !selectedFile)}
            className="bg-gradient-to-r from-gold to-gold-light disabled:from-cream/10 disabled:to-cream/10 disabled:cursor-not-allowed text-noir p-2.5 rounded-full transition-all active:scale-95 mr-0.5"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
      {/* Image Zoom Modal */}
      {zoomImage && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setZoomImage(null)}
        >
          <button 
            className="absolute top-6 right-6 p-2 rounded-full bg-cream/10 hover:bg-cream/20 text-cream transition-colors z-10"
            onClick={(e) => {
              e.stopPropagation();
              setZoomImage(null);
            }}
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center p-4">
            <img 
              src={zoomImage} 
              alt="Zoom" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
