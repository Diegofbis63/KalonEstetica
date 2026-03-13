import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Lead } from '@/types/chat';

interface ChatContextType {
  isChatModalOpen: boolean;
  selectedLeadForChat: Lead | null;
  initialMessage: string;
  initialMedia: string;
  setIsChatModalOpen: (open: boolean) => void;
  setSelectedLeadForChat: (lead: Lead | null) => void;
  setInitialMessage: (msg: string) => void;
  setInitialMedia: (media: string) => void;
  openChat: (lead: Lead, message?: string, media?: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [selectedLeadForChat, setSelectedLeadForChat] = useState<Lead | null>(null);
  const [initialMessage, setInitialMessage] = useState("");
  const [initialMedia, setInitialMedia] = useState("");

  const openChat = (lead: Lead, message: string = "", media: string = "") => {
    setSelectedLeadForChat(lead);
    setInitialMessage(message);
    setInitialMedia(media);
    setIsChatModalOpen(true);
  };

  return (
    <ChatContext.Provider value={{ 
      isChatModalOpen, 
      selectedLeadForChat, 
      initialMessage,
      initialMedia,
      setIsChatModalOpen, 
      setSelectedLeadForChat,
      setInitialMessage,
      setInitialMedia,
      openChat
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
