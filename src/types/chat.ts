export interface ChatMessage {
  role: 'user' | 'admin' | 'bot';
  content: string;
  media_url?: string;
  media_data?: string;
  created_at?: string;
  isPending?: boolean;
}

export interface Lead {
  id: string;
  client_name: string;
  phone?: string;
  contact_info?: {
    phone?: string;
    email?: string;
  };
  is_bot_enabled?: boolean;
}
