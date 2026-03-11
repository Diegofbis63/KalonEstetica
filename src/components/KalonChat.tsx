import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, AlertTriangle } from "lucide-react";
import { streamKalonChat } from "@/lib/kalon-chat";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

export default function KalonChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  // 2. Chatbot Auto-focus: Only after user interacts or bot responds, NEVER on mount
  useEffect(() => {
    if (!isLoading && initialized.current) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    // Auto-trigger greeting if empty
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
      onDelta: (chunk) => upsertAssistant(chunk),
      onDone: () => setIsLoading(false),
      onError: (err) => {
        setError(err);
        setIsLoading(false);
      },
    });
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
      onDelta: (chunk) => upsertAssistant(chunk),
      onDone: () => {
        setIsLoading(false);
        initialized.current = true; // Mark as initialized after first interaction
      },
      onError: (err) => {
        setError(err);
        setIsLoading(false);
      },
    });
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
        {messages.length === 0 && !isLoading && !error && (
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

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed font-sans ${m.role === "user"
                ? "bg-gold/15 border border-gold/20 text-cream rounded-tr-sm"
                : "bg-cream/5 border border-cream/8 text-cream/70 rounded-tl-sm"
                }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2">
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
            className="bg-gradient-to-r from-gold to-gold-light disabled:from-cream/10 disabled:to-cream/10 disabled:cursor-not-allowed text-noir p-2.5 rounded-full transition-all active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
