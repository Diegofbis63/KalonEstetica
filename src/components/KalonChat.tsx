import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, AlertTriangle, Sparkles, Clock, Paperclip } from "lucide-react";
import { streamKalonChat } from "@/lib/kalon-chat";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };
type ChatStep = "identifying" | "phone_input" | "chatting";

export default function KalonChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ChatStep>("identifying");
  const [phone, setPhone] = useState("");
  const [identifiedLead, setIdentifiedLead] = useState<any>(null);
  const [currentStage, setCurrentStage] = useState<string>("initial");
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
      messages: [],
      clientPhone: phone || undefined,
      onDelta: (chunk) => upsertAssistant(chunk),
      onStage: (s) => setCurrentStage(s),
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
        setStep("chatting");
        setMessages([{ 
          role: "assistant", 
          content: `¡Hola de nuevo, **${data.lead.client_name}**! Te recuperé tu sesión. ¿Seguimos donde dejamos? 😊` 
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
    if (!content || isLoading) return;

    setError(null);
    const userMsg: Msg = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
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
      clientPhone: phone || (identifiedLead?.phone) || undefined,
      onDelta: (chunk) => upsertAssistant(chunk),
      onStage: (s) => setCurrentStage(s),
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        toast.info(`Subiendo comprobante: ${file.name}...`);
        // Simmulamos envío de comprobante
        setInput("He subido mi comprobante de pago");
        // En una implementación real, aquí se subiría el archivo a S3/Supabase Storage
        // y se enviaría la URL como mediaUrl al backend.
      }
    };
    input.click();
  };

  return (
    <div
      className="flex flex-col h-[650px] w-full max-w-3xl mx-auto bg-noir-light/80 backdrop-blur-xl border border-cream/10 rounded-2xl overflow-hidden shadow-2xl"
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
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed font-sans ${m.role === "user"
                ? "bg-gold/15 border border-gold/20 text-cream rounded-tr-sm"
                : `bg-cream/5 border border-cream/8 text-cream/70 rounded-tl-sm ${m.content.includes('\n*') || m.content.includes('\n-') ? 'chat-bubble-list-container' : ''}`
                }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 chat-bubble-content">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                m.content
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
        <form
          onSubmit={handleSend}
          className="flex items-center gap-3 bg-cream/5 border border-cream/10 rounded-full p-1.5 focus-within:border-gold/30 transition-all duration-300"
        >
          { (currentStage === 'ask_for_deposit' || currentStage === 'waiting_for_receipt') && (
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
            disabled={isLoading || !input.trim()}
            className="bg-gradient-to-r from-gold to-gold-light disabled:from-cream/10 disabled:to-cream/10 disabled:cursor-not-allowed text-noir p-2.5 rounded-full transition-all active:scale-95 mr-0.5"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
