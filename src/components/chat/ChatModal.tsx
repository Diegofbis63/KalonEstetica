import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MessageSquare, Clock, Send, Paperclip, X, Plus, Sparkles 
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChatMessage, Lead } from "@/types/chat";

interface ChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  initialMessage?: string;
  initialMedia?: string;
}

export default function ChatModal({ open, onOpenChange, lead, initialMessage = "", initialMedia = "" }: ChatModalProps) {
  const [replyMessage, setReplyMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [stagedMedia, setStagedMedia] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Handle initial message and media when modal opens
  useEffect(() => {
    if (open && lead) {
      if (initialMedia) {
        setStagedMedia(initialMedia);
      }
      if (initialMessage) {
        setReplyMessage(initialMessage);
      }
      
      if (!initialMedia && !initialMessage) {
        setReplyMessage("");
        setStagedMedia(null);
      }
    }
  }, [open, initialMessage, initialMedia, lead]);

  const { data: chatHistoryData } = useQuery({
    queryKey: ['chat', lead?.id],
    queryFn: async () => {
      if (!lead) return { history: [] };
      const res = await fetch(`/api/leads/chat?leadId=${lead.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch chat logs');
      return res.json();
    },
    enabled: !!lead && open,
    refetchInterval: open ? 1500 : false,
    refetchIntervalInBackground: true,
  });

  const chatLogs = useMemo(() => chatHistoryData?.history || [], [chatHistoryData?.history]);
  const currentBotEnabled = chatHistoryData?.is_bot_enabled ?? lead?.is_bot_enabled ?? false;

  const toggleBotMutation = useMutation({
    mutationFn: async ({ leadId, isBotEnabled }: { leadId: string, isBotEnabled: boolean }) => {
      const res = await fetch(`/api/leads/chat?leadId=${leadId}&action=toggle-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ isBotEnabled })
      });
      if (!res.ok) throw new Error('Error al cambiar estado del bot');
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all related queries to keep UI synchronized
      queryClient.invalidateQueries({ queryKey: ['chat', lead?.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['income'] });
      toast.success("Estado del BOT actualizado");
    },
    onError: (err: Error) => toast.error(err.message)
  });

  // Scroll to bottom when chat logs change or modal opens
  useEffect(() => {
    if (open && scrollRef.current) {
      const scrollToBottom = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
          
          // Fallback: Also try to scroll the parent container directly if possible
          const viewport = scrollRef.current.closest('[data-radix-scroll-area-viewport]');
          if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
          }
        }
      };

      // Execution in multiple waves to battle layout shifts and lazy loading
      scrollToBottom();
      const t1 = setTimeout(scrollToBottom, 50);
      const t2 = setTimeout(scrollToBottom, 150);
      const t3 = setTimeout(scrollToBottom, 400);
      const t4 = setTimeout(scrollToBottom, 1000); // Guard for slow image loading
      
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }
  }, [open, chatLogs.length, lead?.id]);

  const sendReplyMutation = useMutation({
    mutationFn: async ({ leadId, message, mediaData }: { leadId: string, message?: string, mediaData?: string }) => {
      const res = await fetch(`/api/leads/chat?leadId=${leadId}&action=reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ leadId, message, mediaData })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al enviar mensaje');
      }
      return res.json();
    },
    onMutate: async (newReply) => {
      await queryClient.cancelQueries({ queryKey: ['chat', newReply.leadId] });
      const previousChat = queryClient.getQueryData(['chat', newReply.leadId]);
      
      queryClient.setQueryData(['chat', newReply.leadId], (old: { history: ChatMessage[], is_bot_enabled: boolean } | undefined) => ({
        ...old,
        history: [...(old?.history || []), {
          role: 'admin',
          content: newReply.message,
          created_at: new Date().toISOString(),
          isPending: true
        }]
      } as unknown));

      return { previousChat };
    },
    onSuccess: () => {
      setReplyMessage("");
      setStagedMedia(null);
      setIsUploading(false);
      toast.success("Mensaje enviado");
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chat', variables.leadId] });
      setIsUploading(false);
    },
    onError: (err: Error, newReply, context: { previousChat?: unknown } | undefined) => {
      if (context?.previousChat) {
        queryClient.setQueryData(['chat', newReply.leadId], context.previousChat);
      }
      setIsUploading(false);
      toast.error(err.message);
    }
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !lead) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Solo se permiten imágenes");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setStagedMedia(reader.result as string);
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSend = () => {
    if ((replyMessage.trim() || stagedMedia) && lead) {
      sendReplyMutation.mutate({ 
        leadId: lead.id, 
        message: replyMessage.trim(), 
        mediaData: stagedMedia || undefined 
      });
    }
  };

  if (!lead) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => {
        // Prevent closing if lightbox is open
        if (lightboxImage && !val) return;
        onOpenChange(val);
      }}>
        <DialogContent 
          onPointerDownOutside={(e) => {
            if (lightboxImage) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (lightboxImage) e.preventDefault();
          }}
          className="bg-noir border border-gold/20 text-cream max-w-2xl h-[85vh] flex flex-col p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        >
            <DialogHeader className="p-6 border-b border-white/5 bg-noir-light/30 backdrop-blur-xl shrink-0">
                <DialogTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center">
                        <MessageSquare className="w-6 h-6 text-gold" />
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-bold text-cream leading-none mb-1">{lead.client_name}</p>
                        <div className="flex items-center gap-2">
                          <p className={`text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 ${currentBotEnabled ? 'text-emerald-400' : 'text-amber-500'}`}>
                            {currentBotEnabled ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                BOT ON
                              </>
                            ) : (
                              <>
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                BOT OFF
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                        <Switch
                          checked={currentBotEnabled}
                          onCheckedChange={(val) => {
                            if (lead) {
                              toggleBotMutation.mutate({ leadId: lead.id, isBotEnabled: val });
                            }
                          }}
                          className="data-[state=checked]:bg-gold scale-75"
                        />
                        <span className={`text-[8px] font-black tracking-widest ${currentBotEnabled ? 'text-emerald-400' : 'text-cream/20'}`}>
                          {currentBotEnabled ? 'BOT ON' : 'BOT OFF'}
                        </span>
                      </div>
                      <Badge variant="outline" className="border-gold/20 text-gold text-[9px] px-3 py-1 uppercase tracking-widest hidden sm:block">ID: {lead.id.slice(0,8)}</Badge>
                    </div>
                </DialogTitle>
                <DialogDescription className="hidden">Canal de comunicación directa de KÂLON</DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 p-6 bg-[url('https://www.transparenttextures.com/patterns/dark-leather.png')]">
                <div className="space-y-6">
                  {chatLogs.length > 0 ? (
                      chatLogs.map((m: ChatMessage, i: number) => {
                          const isUser = m.role === 'user';
                          const isAdmin = m.role === 'admin';
                          const isBot = m.role === 'bot';

                          // Legacy Image Extraction for old chat logs
                          let displayContent = m.content || "";
                          let displayMedia = m.media_url || m.media_data;

                          if (displayContent.includes('📸 [Imagen enviada]')) {
                              const urlMatch = displayContent.match(/\((https?:\/\/[^)]+)\)/);
                              if (urlMatch) {
                                  if (!displayMedia) displayMedia = urlMatch[1];
                                  displayContent = displayContent.replace(urlMatch[0], '');
                              }
                              displayContent = displayContent.replace(/📸\s*\[Imagen enviada\]/gi, '').trim();
                          }

                          return (
                            <div key={i} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[85%] space-y-1 ${isUser ? 'items-start' : 'items-end'} flex flex-col`}>
                                    <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-xl border backdrop-blur-md transition-all ${
                                        isUser 
                                          ? 'bg-noir-light/60 border-white/5 text-cream/80 rounded-tl-none ring-1 ring-white/5' 
                                          : isAdmin 
                                          ? 'bg-gradient-to-br from-emerald-600/90 to-emerald-800/90 text-white rounded-tr-none border-emerald-400/20'
                                          : 'bg-gradient-to-br from-gold/30 to-gold/10 text-gold rounded-tr-none border-gold/40'
                                    } ${m.isPending ? 'opacity-50 scale-95' : 'opacity-100'}`}>
                                        <div className="flex items-center justify-between gap-4 mb-2">
                                          <p className="text-[8px] uppercase tracking-[0.2em] font-black opacity-40">
                                            {isUser ? 'Cliente' : isAdmin ? 'Soporte KÂLON' : 'BOT'}
                                          </p>
                                          {m.isPending && <Clock className="w-2.5 h-2.5 animate-spin opacity-30" />}
                                        </div>
                                        
                                        {displayMedia && (
                                          <div className="mb-3 rounded-xl overflow-hidden border border-white/10 bg-black/60 shadow-inner group/img relative min-h-[150px] min-w-[200px] flex items-center justify-center">
                                            <img 
                                              src={displayMedia} 
                                              alt="Multimedia" 
                                              className="max-w-full max-h-[400px] object-contain cursor-zoom-in hover:scale-105 transition-transform duration-500" 
                                              onClick={() => setLightboxImage(displayMedia || null)}
                                              onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                target.style.display = 'none';
                                                const parent = target.parentElement;
                                                if (parent) {
                                                  const errHint = document.createElement('div');
                                                  errHint.className = 'p-4 text-[10px] text-cream/40 text-center italic';
                                                  errHint.innerHTML = '📷 Imagen no disponible o expirada';
                                                  parent.appendChild(errHint);
                                                }
                                              }}
                                            />
                                          </div>
                                        )}
                                        
                                        {displayContent && <p className="font-medium whitespace-pre-wrap">{displayContent}</p>}
                                    </div>
                                    <span className="text-[9px] text-cream/20 font-bold px-1 italic">
                                      {m.created_at ? new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'Enviando...'}
                                    </span>
                                </div>
                            </div>
                          );
                      })
                  ) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 italic py-20 text-center">
                          <MessageSquare className="w-12 h-12 mb-4 opacity-10" />
                          <p className="text-sm uppercase tracking-widest font-black">Sin mensajes previos</p>
                          <p className="text-[10px] mt-2">Inicia la conversación enviando el comprobante o un saludo.</p>
                      </div>
                  )}
                  <div ref={scrollRef} />
                </div>
            </ScrollArea>

            <div className="p-6 bg-noir-light/50 border-t border-white/5 backdrop-blur-xl shrink-0">
              {/* Staged Media Preview */}
              {stagedMedia && (
                <div className="mb-4 relative inline-block group">
                  <div className="w-32 h-32 rounded-2xl overflow-hidden border-2 border-gold/50 shadow-2xl bg-black">
                    <img src={stagedMedia} alt="Staged" className="w-full h-full object-cover" />
                  </div>
                  <button 
                    onClick={() => setStagedMedia(null)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg hover:bg-rose-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="absolute inset-0 bg-gold/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              )}

              <div className="flex items-center gap-4">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || sendReplyMutation.isPending}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10 text-cream/40 hover:text-gold hover:border-gold/30 transition-all disabled:opacity-20 shadow-lg"
                >
                  {isUploading ? <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" /> : <Paperclip className="w-5 h-5" />}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    placeholder="Escribe una respuesta manual..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSend();
                    }}
                    className="w-full bg-noir border border-white/10 rounded-2xl py-4 px-6 text-sm outline-none focus:border-gold/50 transition-all pr-16 shadow-inner"
                  />
                  <button 
                    onClick={handleSend}
                    disabled={(!replyMessage.trim() && !stagedMedia) || sendReplyMutation.isPending}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-gold text-noir hover:scale-105 active:scale-95 disabled:opacity-30 disabled:grayscale transition-all shadow-lg"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <p className="text-[9px] text-center text-cream/20 uppercase tracking-[0.2em] font-bold mt-4">
                Canal de comunicación seguro cifrado por KÂLON
              </p>
            </div>

            {/* Lightbox - Inside DialogContent to avoid closing the modal when clicking image */}
            {lightboxImage && (
              <div 
                className="absolute inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 animate-in fade-in duration-300"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setLightboxImage(null); 
                }}
              >
                <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setLightboxImage(null); 
                    }}
                    className="absolute -top-14 -right-4 text-cream/60 hover:text-gold transition-colors p-3 bg-white/5 rounded-full backdrop-blur-md z-[110]"
                  >
                    <X className="w-8 h-8" />
                  </button>
                  <img 
                    src={lightboxImage} 
                    alt="Fullscreen" 
                    className="max-w-[95%] max-h-[80vh] rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 animate-in zoom-in duration-300 object-contain" 
                  />
                </div>
              </div>
            )}
        </DialogContent>
      </Dialog>
    </>
  );
}
