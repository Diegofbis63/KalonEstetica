import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Lead } from '@/types/chat';

interface ChatContextType {
  isChatModalOpen: boolean;
  selectedLeadForChat: Lead | null;
  initialMessage: string;
  setIsChatModalOpen: (open: boolean) => void;
  setSelectedLeadForChat: (lead: Lead | null) => void;
  setInitialMessage: (msg: string) => void;
  openChat: (lead: Lead, message?: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [selectedLeadForChat, setSelectedLeadForChat] = useState<Lead | null>(null);
  const [initialMessage, setInitialMessage] = useState("");

  const openChat = (lead: Lead, message: string = "") => {
    setSelectedLeadForChat(lead);
    setInitialMessage(message);
    setIsChatModalOpen(true);
  };

  return (
    <ChatContext.Provider value={{ 
      isChatModalOpen, 
      selectedLeadForChat, 
      initialMessage,
      setIsChatModalOpen, 
      setSelectedLeadForChat,
      setInitialMessage,
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
