
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getCategories, 
    getActiveServices, 
    getLeadByPhone, 
    getChatHistory, 
    updateLeadName, 
    insertChatLog, 
    createLead, 
    findLeadByFlexiblePhone,
    getAppointmentsForDate, 
    createAppointment, 
    markLeadAsConverted,
    updateLeadState,
    sql
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
        
        // 4. IDENTIFY LEAD (Unified DB Persistence)
        let leadId = null;
        let isBotEnabled = true;
        let leadName = null;
        let leadPhone = null;
        let savedState = null;
        let lastUpdate = null;

        const identificationId = userId || (body.identificationId || body.userId || (body.clientPhone?.length > 5 ? body.clientPhone : null));

        if (identificationId) {
            const idStr = identificationId.toString();
            const normalizedPhone = idStr.replace(/\D/g, '');
            let lead = normalizedPhone.length >= 8 ? await findLeadByFlexiblePhone(normalizedPhone) : null;
            
            if (!lead) {
                const results = await sql`
                    SELECT id, is_bot_enabled, client_name, contact_info, current_state, updated_at 
                    FROM leads 
                    WHERE contact_info->>'uuid' = ${idStr} 
                       OR contact_info->>'phone' = ${idStr}
                    LIMIT 1
                `;
                if (results.length > 0) lead = results[0];
            }

            if (lead) {
                leadId = lead.id;
                isBotEnabled = lead.is_bot_enabled !== false;
                leadName = lead.client_name;
                const contact = typeof lead.contact_info === 'string' ? JSON.parse(lead.contact_info) : lead.contact_info;
                leadPhone = contact?.phone;
                savedState = lead.current_state;
                lastUpdate = lead.updated_at;
            }
        }

        // 5. ENSURE LEAD PERSISTENCE (Create if fresh session)
        if (!leadId && identificationId) {
            const idStr = identificationId.toString();
            const isPhone = /^\d+$/.test(idStr) && idStr.length < 15;
            const contactInfo = isPhone 
                ? { phone: idStr, source: userId ? 'whatsapp' : 'web' }
                : { uuid: idStr, source: 'web' };

            const newLead = await createLead(DEFAULT_ORG_ID, 'Cliente', contactInfo);
            leadId = newLead.id;
        }

        // 6. BUILD CONVERSATION CONTEXT
        const messages = body.messages || [];
        if (!messages.length && incomingMessage) {
            messages.push({ role: 'user', content: incomingMessage, media_url: incomingMediaUrl });
        }
        
        // 7. EXTRACT STATE (DB State is King)
        const state = await extractState(messages, categories, services, isBotEnabled, leadName, leadPhone, savedState, lastUpdate);

        // 8. UPDATE & EVOLVE LEAD
        if (leadId) {
            if (state.clientName && state.clientName !== 'Cliente' && state.clientName !== leadName) { 
                await updateLeadName(leadId, state.clientName);
            }
            if (state.clientPhone && !leadPhone) {
                 await sql`UPDATE leads SET contact_info = contact_info || ${JSON.stringify({ phone: state.clientPhone })}, updated_at = NOW() WHERE id = ${leadId}`;
            }

            await updateLeadState(leadId, state);
            await insertChatLog(leadId, 'user', incomingMessage, incomingMediaUrl, !!userId, body.mediaData);
        }

        if (!isBotEnabled) {
            console.log("[chat.ts] Bot is disabled for this lead. Exiting.");
            return res.status(200).json({ status: 'bot_disabled' });
        }

        // 8. AVAILABILITY SEARCH
        const foundSlots: any[] = [];
        let timeWasAdjusted = false;
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
                    const argTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Cordoba', hour: '2-digit', minute: '2-digit', hour12: false }).format(start);
                    const [h, m] = argTime.split(':').map(Number);
                    const startMin = h * 60 + m;
                    return { start: startMin, end: startMin + 60 };
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
                // Determine if we adjusted from user's explicit request
                const reqD = state.requestedDate;
                const reqT = state.requestedTime;
                
                if (reqD && foundSlots[0].date !== reqD) timeWasAdjusted = true;
                if (reqT && foundSlots[0].time !== reqT) timeWasAdjusted = true;
                
                // Fallback for default "tomorrow" search if the only slot found is at a different time than requested
                if (reqT && foundSlots[0].time !== reqT) timeWasAdjusted = true;

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
                const totalPrice = selectedSvcObjs.reduce((a, b) => a + Math.round(Number(b.price)), 0);
                const totalDur = selectedSvcObjs.reduce((a, b) => a + parseDuration(b.duration), 0);
                const dateTime = `${state.pendingDate}T${state.pendingTime}:00-03:00`;
                
                await createAppointment(leadId, DEFAULT_ORG_ID, dateTime, catNames, totalPrice, totalDur, selectedSvcObjs);
                
                state.stage = 'done';
                await markLeadAsConverted(leadId);
            }
        }

        // 10. GENERATE RESPONSE
        const responseText = generateResponse(state, categories, services, foundSlots, !!userId, !!(incomingMediaUrl || body.mediaData), timeWasAdjusted);
        
        if (leadId) {
            await updateLeadState(leadId, state);
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
                // Enviamos el stage en cada chunk para que el frontend sepa siempre el estado actual
                const data = JSON.stringify({ 
                    choices: [{ delta: { content: chunk } }],
                    stage: state.stage 
                });
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
