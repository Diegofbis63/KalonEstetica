import type { VercelResponse } from '@vercel/node';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatState {
    stage: string;
    clientName?: string;
    clientPhone?: string;
    selectedServiceIds?: string[];
    currentCategoryId?: string;
    [key: string]: any;
}

export interface ClassificationResult {
    intent: 'SALUDO' | 'REGISTRO' | 'CONSULTA_SERVICIO' | 'TURNO' | 'OTRO';
    detected_categories: string[];
    detected_name?: string;
    is_negation: boolean;
}

export interface StageContext {
    text: string;
    leadId: string | number | null;
    identificationId: string;
    currentState: ChatState;
    classification: ClassificationResult;
    categories: any[];
    services: any[];
    mediaUrls: string[];
}
