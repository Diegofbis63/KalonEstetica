
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getCategories, 
    getActiveServices, 
    getLeadByPhone, 
    getChatHistory, 
    updateLeadName, 
    insertChatLog, 
    createLead, 
    getAppointmentsForDate, 
    createAppointment, 
    markLeadAsConverted 
} from './_services/db.js';
import { 
    parseDuration, 
    formatForWhatsApp 
} from './_services/utils.js';
import { 
    extractState, 
    generateResponse 
} from './_services/stateMachine.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log(`[chat.ts] --- Incoming Request: ${req.method} ---`);
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000';

    try {
        const body = req.body || {};
        let incomingMessage = body.message || "";
        const userIdRaw = body.userId || "";
        const userId = userIdRaw ? userIdRaw.split('@')[0].replace(/\D/g, '') : null;
        let incomingMediaUrl = body.mediaUrl || null;
        
        console.log(`[chat.ts] Message: "${incomingMessage}", User: ${userId}`);

        // 1. CLEAN MEDIA: Extract and remove WhatsApp Bridge placeholders
        const anyUrlMatch = incomingMessage.match(/(https?:\/\/[^\s)]+)/);
        if (anyUrlMatch && !incomingMediaUrl) {
            incomingMediaUrl = anyUrlMatch[1];
            // Remove the URL and its wrapping parentheses if present
            incomingMessage = incomingMessage.replace(new RegExp(`\\(?${anyUrlMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)?`, 'g'), '');
        }

        if (incomingMessage.includes('📸 [Imagen enviada]') || incomingMessage.includes('📷') || incomingMessage.includes('[Foto]')) {
            incomingMessage = incomingMessage.replace(/📸\s*\[Imagen enviada\]/gi, '');
            incomingMessage = incomingMessage.replace(/📷/g, '');
            incomingMessage = incomingMessage.replace(/\[Foto\]/gi, '');
            incomingMessage = incomingMessage.trim();
        } 
        
        // 2. DIRECT URL: If message is just whitespace now, it was likely just media
        if (!incomingMessage.trim() && incomingMediaUrl) {
            incomingMessage = ""; 
        }

        // 3. FETCH DATA (Parallel)
        const [categories, services] = await Promise.all([
            getCategories(),
            getActiveServices()
        ]);
        
        // 4. IDENTIFY LEAD
        let leadId = null;
        let isBotEnabled = true;
        let leadName = null;
        let leadPhone = null;

        if (userId) {
            const lead = await getLeadByPhone(userId);
            if (lead) {
                leadId = lead.id;
                isBotEnabled = lead.is_bot_enabled !== false;
                leadName = lead.client_name;
                leadPhone = typeof lead.contact_info === 'string' ? JSON.parse(lead.contact_info).phone : lead.contact_info?.phone;
            }
        }

        // 5. BUILD CONVERSATION CONTEXT
        let messages = body.messages || [];
        if (userId && !messages.length && incomingMessage) {
            if (leadId) {
                messages = await getChatHistory(leadId);
            }
            messages.push({ role: 'user', content: incomingMessage, media_url: incomingMediaUrl });
        }

        // 6. EXTRACT STATE
        const state = await extractState(messages, categories, services, isBotEnabled, leadName, leadPhone);

        // 7. PERSISTENCE & UPDATES
        if (leadId) {
            if (state.clientName && state.clientName !== 'Cliente') { 
                await updateLeadName(leadId, state.clientName);
            }
            await insertChatLog(leadId, 'user', incomingMessage, incomingMediaUrl, !!userId, body.mediaData);
        } else if (userId || body.clientPhone) {
            const phone = (userId || body.clientPhone || '').replace(/\D/g, '');
            const nameToSave = (state.clientName && state.clientName !== 'Cliente') ? state.clientName : 'Cliente';
            const newLead = await createLead(DEFAULT_ORG_ID, nameToSave, { phone: phone, source: userId ? 'whatsapp' : 'web' });
            leadId = newLead.id;
            await insertChatLog(leadId, 'user', incomingMessage, incomingMediaUrl, !!userId, body.mediaData);
        }

        if (!isBotEnabled) {
            console.log("[chat.ts] Bot is disabled for this lead. Exiting.");
            return res.status(200).json({ status: 'bot_disabled' });
        }

        // 8. AVAILABILITY SEARCH
        const foundSlots: any[] = [];
        if (state.stage === 'availability_proposal' && state.selectedServiceIds.length > 0) {
            console.log("[chat.ts] Calculating availability slots...");
            const selectedSvcObjs = services.filter(s => state.selectedServiceIds.includes(s.id));
            const totalDur = selectedSvcObjs.reduce((a, b) => a + parseDuration(b.duration), 0);
            
            const baseDate = state.requestedDate ? new Date(state.requestedDate + "T12:00:00Z") : new Date();
            if (!state.requestedDate) {
                baseDate.setDate(new Date().getDate() + 1);
            }

            const limit = state.requestedAllOptions ? 3 : 1;

            for (let d = 0; d < 30 && foundSlots.length < limit; d++) {
                const searchDate = new Date(baseDate);
                searchDate.setDate(baseDate.getDate() + d);
                
                if (searchDate.getDay() === 0) continue; 
                const dateStr = searchDate.toISOString().split('T')[0];

                const taken = await getAppointmentsForDate(dateStr);
                const takenIntervals = taken.map(r => {
                    const start = new Date(r.date_time);
                    return { start: start.getUTCHours() * 60 + start.getUTCMinutes(), end: (start.getUTCHours() * 60 + start.getUTCMinutes()) + 60 };
                });

                let startSearch = 9 * 60;
                if (state.requestedTime && d === 0) {
                    const [rh, rm] = state.requestedTime.split(':').map(Number);
                    startSearch = Math.max(9 * 60, rh * 60 + rm);
                }

                for (let totalMin = startSearch; totalMin <= 20 * 60 - totalDur; totalMin += 30) {
                    const potentialStart = totalMin;
                    const potentialEnd = totalMin + totalDur;
                    const h = Math.floor(potentialStart / 60);
                    const m = potentialStart % 60;
                    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

                    if (state.rejectedDates.includes(`${dateStr} ${timeStr}`)) continue;
                    
                    let overlaps = false;
                    for (const interval of takenIntervals) {
                        if (potentialStart < interval.end && potentialEnd > interval.start) {
                            overlaps = true;
                            break;
                        }
                    }
                    
                    if (!overlaps) {
                        foundSlots.push({ date: dateStr, time: timeStr });
                        if (foundSlots.length >= limit) break;
                    }
                }
            }
            if (foundSlots.length > 0) {
                state.pendingDate = foundSlots[0].date;
                state.pendingTime = foundSlots[0].time;
            }
        }

        // 9. BOOKING CONFIRMATION (Media receipt)
        if ((state.stage === 'waiting_for_receipt' || state.stage === 'payment_request' || state.stage === 'done') && (incomingMediaUrl || body.mediaData)) {
            if (leadId) {
                console.log("[chat.ts] Media received, confirming appointment...");
                const selectedSvcObjs = services.filter(s => state.selectedServiceIds.includes(s.id));
                const catNames = Array.from(new Set(selectedSvcObjs.map(s => s.category_name || "Servicio"))).join(' + ');
                const totalPrice = selectedSvcObjs.reduce((a, b) => a + Number(b.price), 0);
                const totalDur = selectedSvcObjs.reduce((a, b) => a + parseDuration(b.duration), 0);
                const dateTime = `${state.pendingDate}T${state.pendingTime}:00Z`;
                
                await createAppointment(leadId, DEFAULT_ORG_ID, dateTime, catNames, totalPrice, totalDur, selectedSvcObjs);
                
                state.stage = 'done';
                await markLeadAsConverted(leadId);
            }
        }

        // 10. GENERATE RESPONSE
        const responseText = generateResponse(state, categories, services, foundSlots, !!userId, !!(incomingMediaUrl || body.mediaData));
        
        if (leadId) {
            await insertChatLog(leadId, 'bot', responseText, null, !!userId);
        }

        // 11. SEND RESPONSE
        if (userId) {
            return res.status(200).json({ 
                responseText: formatForWhatsApp(responseText), 
                stage: state.stage 
            });
        } else {
            // Web/SSE implementation
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            const words = responseText.split(' ');
            for (let i = 0; i < words.length; i++) {
                const chunk = (i === 0 ? '' : ' ') + words[i];
                const data = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
                res.write(`data: ${data}\n\n`);
                await new Promise(r => setTimeout(r, 20 + Math.random() * 20));
            }
            res.write('data: [DONE]\n\n');
            res.end();
        }
    } catch (e: any) {
        console.error("[chat.ts] CRITICAL ERROR:", e);
        if (!res.writableEnded) {
            // Mandamos el mensaje de error "defensivo" que pidió el usuario
            return res.status(200).json({ 
                responseText: "Hubo un pequeño error procesando tu solicitud, ¿podrías repetirlo? 😊", 
                stage: 'error' 
            });
        }
    }
}
