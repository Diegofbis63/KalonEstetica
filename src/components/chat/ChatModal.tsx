import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MessageSquare, Clock, Send, Paperclip, X, Plus 
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Handle initial message and media when modal opens
  useEffect(() => {
    if (open && lead) {
      if (initialMedia) {
        // Automatically send the image
        sendReplyMutation.mutate({ 
          leadId: lead.id, 
          message: initialMessage, 
          mediaData: initialMedia 
        });
      } else if (initialMessage) {
        setReplyMessage(initialMessage);
      } else {
        setReplyMessage("");
      }
    }
  }, [open, initialMessage, initialMedia, lead?.id]);

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
    refetchInterval: open ? 2000 : false,
  });

  const chatLogs = useMemo(() => chatHistoryData?.history || [], [chatHistoryData?.history]);

  useEffect(() => {
    if (open && scrollRef.current) {
        const timeoutId = setTimeout(() => {
            scrollRef.current?.scrollIntoView({ behavior: 'auto' });
        }, 100);
        return () => clearTimeout(timeoutId);
    }
  }, [open, chatLogs.length]);

  const sendReplyMutation = useMutation({
    mutationFn: async ({ leadId, message, mediaData }: { leadId: string, message?: string, mediaData?: string }) => {
      const res = await fetch('/api/leads/reply', {
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
      
      queryClient.setQueryData(['chat', newReply.leadId], (old: any) => ({
        ...old,
        history: [...(old?.history || []), {
          role: 'admin',
          content: newReply.message,
          created_at: new Date().toISOString(),
          isPending: true
        }]
      }));

      return { previousChat };
    },
    onSuccess: () => {
      setReplyMessage("");
      setIsUploading(false);
      toast.success("Mensaje enviado");
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chat', variables.leadId] });
      setIsUploading(false);
    },
    onError: (err: Error, newReply, context: any) => {
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

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      sendReplyMutation.mutate({ 
        leadId: lead.id, 
        message: "", 
        mediaData: base64 
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!lead) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-noir border border-gold/20 text-cream max-w-2xl h-[85vh] flex flex-col p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <DialogHeader className="p-6 border-b border-white/5 bg-noir-light/30 backdrop-blur-xl shrink-0">
                <DialogTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center">
                        <MessageSquare className="w-6 h-6 text-gold" />
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-bold text-cream leading-none mb-1">{lead.client_name}</p>
                        <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-black flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Chat en Vivo • Aura AI
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-gold/20 text-gold text-[9px] px-3 py-1 uppercase tracking-widest">ID: {lead.id.slice(0,8)}</Badge>
                </DialogTitle>
                <DialogDescription className="hidden">Canal de comunicación directa de KÂLON</DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 p-6 bg-[url('https://www.transparenttextures.com/patterns/dark-leather.png')]">
                <div className="space-y-6">
                  {chatLogs.length > 0 ? (
                      chatLogs.map((m: any, i: number) => {
                          const isUser = m.role === 'user';
                          const isAdmin = m.role === 'admin';
                          const isBot = m.role === 'bot';

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
                                            {isUser ? 'Cliente' : isAdmin ? 'Soporte KÂLON' : 'Aura I.A.'}
                                          </p>
                                          {m.isPending && <Clock className="w-2.5 h-2.5 animate-spin opacity-30" />}
                                        </div>
                                        
                                        {(m.media_url || m.media_data) && (
                                          <div className="mb-3 rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-inner group/img relative">
                                            <img 
                                              src={m.media_url || m.media_data} 
                                              alt="Multimedia" 
                                               className="max-w-full h-auto cursor-zoom-in hover:scale-105 transition-transform duration-500" 
                                              onClick={() => setLightboxImage(m.media_url || m.media_data || null)}
                                            />
                                          </div>
                                        )}
                                        
                                        <p className="font-medium whitespace-pre-wrap">{m.content}</p>
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
                      if (e.key === 'Enter' && replyMessage.trim()) {
                        sendReplyMutation.mutate({ leadId: lead.id, message: replyMessage });
                      }
                    }}
                    className="w-full bg-noir border border-white/10 rounded-2xl py-4 px-6 text-sm outline-none focus:border-gold/50 transition-all pr-16 shadow-inner"
                  />
                  <button 
                    onClick={() => {
                      if (replyMessage.trim()) {
                        sendReplyMutation.mutate({ leadId: lead.id, message: replyMessage });
                      }
                    }}
                    disabled={!replyMessage.trim() || sendReplyMutation.isPending}
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
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button className="absolute top-8 right-8 text-cream hover:text-gold">
            <X className="w-10 h-10" />
          </button>
          <img src={lightboxImage} alt="Fullscreen" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl animate-in zoom-in duration-300" />
        </div>
      )}
    </>
  );
}
