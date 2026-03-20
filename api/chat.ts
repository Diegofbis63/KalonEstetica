
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
    createAppointment, 
    markLeadAsConverted,
    updateLeadState,
    getStaffBySpecialty,
    getAvailableSlotsFromDB,
    db,
    sql as neonSql
} from './_services/db.js';
import * as schema from './_services/schema.js';
import { eq, or, sql as drizzleSql } from 'drizzle-orm';
import { 
    parseDuration, 
    formatForWhatsApp 
} from './_services/utils.js';
import { 
    extractState, 
    generateResponse 
} from './_services/stateMachine.js';
import { generateMenuImage } from './_services/imageGenerator.js';
import { getNlpManager } from './_services/nlp.js';

// WARM-UP PATTERN: Pre-load the NLP Manager at module startup
// This ensures that while Vercel instance is 'hot', the model is ready in memory.
getNlpManager().then(() => console.log("[chat.ts] NLP Manager warmed up")).catch(e => console.error("[chat.ts] NLP Warmup failed:", e));

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log(`[chat.ts] --- Incoming Request: ${req.method} ---`);
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const DEFAULT_ORG_ID = 'kalon-estetica';


    try {
        const body = req.body || {};
        let incomingMessage = body.message || "";
        const userIdRaw = body.userId || "";
        const userId = userIdRaw ? userIdRaw.split('@')[0].replace(/\D/g, '') : null;
        let incomingMediaUrl = body.mediaUrl || null;
        
        console.log(`[chat.ts] --- New Request: "${incomingMessage}", User: ${userId} ---`);

        // 1. CLEAN MEDIA: Extract and remove WhatsApp Bridge placeholders
        const anyUrlMatch = incomingMessage.match(/(https?:\/\/[^\s)]+)/);
        if (anyUrlMatch && !incomingMediaUrl) {
            incomingMediaUrl = anyUrlMatch[1];
            incomingMessage = incomingMessage.replace(new RegExp(`\\(?${anyUrlMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)?`, 'g'), '');
        }

        if (incomingMessage.includes('📸 [Imagen enviada]') || incomingMessage.includes('📷') || incomingMessage.includes('[Foto]')) {
            incomingMessage = incomingMessage.replace(/📸\s*\[Imagen enviada\]/gi, '');
            incomingMessage = incomingMessage.replace(/📷/g, '');
            incomingMessage = incomingMessage.replace(/\[Foto\]/gi, '');
            incomingMessage = incomingMessage.trim();
        } 
        
        if (!incomingMessage.trim() && incomingMediaUrl) {
            incomingMessage = ""; 
        }

        // 2. FETCH DATA
        console.log("[chat.ts] Stage 2: Fetching categories/services");
        const [categories, services] = await Promise.all([
            getCategories(),
            getActiveServices()
        ]);
        
        // 3. IDENTIFY/CREATE LEAD
        console.log("[chat.ts] Stage 3: Identifying lead");
        const identificationId = userId || (body.identificationId || body.userId || (body.clientPhone?.length > 5 ? body.clientPhone : null));
        let leadId = null;
        let isBotEnabled = true;
        let leadName = null;
        let leadPhone = null;
        let savedState = null;
        let lastUpdate = null;

        if (identificationId) {
            const idStr = identificationId.toString();
            const normalizedPhone = idStr.replace(/\D/g, '');
            let lead = normalizedPhone.length >= 8 ? await findLeadByFlexiblePhone(normalizedPhone) : null;
            
            if (!lead && idStr.length > 5) {
                const results = await db.query.leads.findMany({
                    where: drizzleSql`contact_info->>'uuid' = ${idStr} OR contact_info->>'phone' = ${idStr}`,
                    limit: 1
                });
                if (results.length > 0) lead = results[0];
            }

            if (lead) {
                leadId = lead.id;
                isBotEnabled = lead.is_bot_enabled !== false;
                leadName = lead.client_name;
                
                let contact: any = lead.contact_info;
                if (typeof contact === 'string') {
                    try {
                        contact = JSON.parse(contact);
                    } catch {
                        contact = {};
                    }
                }
                
                leadPhone = contact?.phone;
                savedState = lead.current_state;
                lastUpdate = lead.updated_at;
            } else {
                const contactInfo = /^\d+$/.test(idStr) && idStr.length < 15 ? { phone: idStr } : { uuid: idStr };
                const newLead = await createLead(DEFAULT_ORG_ID, 'Cliente', contactInfo);
                leadId = newLead.id;
            }
        }

        // 4. EXTRACT STATE
        console.log("[chat.ts] Stage 4: Extracting state");
        const messages = body.messages || [];
        if (!messages.length && incomingMessage) messages.push({ role: 'user', content: incomingMessage, media_url: incomingMediaUrl });
        const state = await extractState(messages, categories, services, isBotEnabled, leadName, leadPhone, savedState, lastUpdate);

        if (leadId) {
            await updateLeadState(leadId, state);
            await insertChatLog(leadId, 'user', incomingMessage, incomingMediaUrl, !!userId, body.mediaData);
        }

        if (!isBotEnabled) return res.status(200).json({ status: 'bot_disabled' });

        // 5. AVAILABILITY
        console.log("[chat.ts] Stage 5: Availability Search");
        const foundSlots: { date: string, time: string }[] = [];
        let timeWasAdjusted = false;
        let eligibleStaff: any[] = [];

        if (state.stage === 'availability_proposal' && state.selectedServiceIds.length > 0) {
            const currentCatId = services.find(s => state.selectedServiceIds.includes(s.id))?.category_id;
            if (currentCatId) {
                eligibleStaff = await getStaffBySpecialty(currentCatId);
                if (eligibleStaff.length > 0) {
                    const nowArg = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Cordoba"}));
                    const searchStart = state.requestedDate ? new Date(state.requestedDate + "T00:00:00") : new Date(nowArg);
                    const searchEnd = new Date(searchStart); searchEnd.setDate(searchEnd.getDate() + 14);
                    const slots = await getAvailableSlotsFromDB(currentCatId, searchStart, searchEnd);
                    
                    for (const s of slots) {
                        const slotDate = new Date(s.slot_time);
                        const dateStr = slotDate.toISOString().split('T')[0];
                        const timeStr = slotDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba', hour12: false });
                        if (state.rejectedDates.includes(`${dateStr} ${timeStr}`)) continue;
                        foundSlots.push({ date: dateStr, time: timeStr });
                        if (foundSlots.length >= 1) break;
                    }
                }
            }
            if (foundSlots.length > 0) {
                state.pendingDate = foundSlots[0].date;
                state.pendingTime = foundSlots[0].time;
            }
        }

        // 6. GENERATE RESPONSE
        console.log("[chat.ts] Stage 6: Generating Response");
        const responseData = generateResponse(state, categories, services, foundSlots, !!userId, !!(incomingMediaUrl || body.mediaData), timeWasAdjusted, (state.stage === 'availability_proposal' && !eligibleStaff.length));
        const responseText = responseData.text;
        let mediaData: string | undefined;

        if (responseData.visualMenu) {
            console.log("[chat.ts] Stage 7: Visual Menu Generation Started");
            try {
                const imgBuffer = await generateMenuImage(responseData.visualMenu.title, responseData.visualMenu.items);
                mediaData = `data:image/png;base64,${imgBuffer.toString('base64')}`;
                console.log("[chat.ts] Stage 7: Visual Menu Generation Success");
            } catch (err) {
                console.error("[chat.ts] Stage 7: Visual Menu Generation Failed:", err);
            }
        }
        
        if (leadId) {
            await updateLeadState(leadId, state);
            await insertChatLog(leadId, 'bot', responseText, null, !!userId, mediaData);
        }

        // 7. RETURN
        console.log(`[chat.ts] Finalizing response. Stage: ${state.stage}`);
        if (userId) {
            return res.status(200).json({ 
                responseText: formatForWhatsApp(responseText), 
                botResponse: formatForWhatsApp(responseText),
                media_link: mediaData, 
                mediaData: mediaData, 
                stage: state.stage 
            });
        } else {
            res.setHeader('Content-Type', 'text/event-stream');
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: responseText } }], botResponse: responseText, media_url: mediaData, stage: state.stage })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
        }
    } catch (e: any) {
        console.error("[chat.ts] CRITICAL ERROR IN HANDLER:", e);
        if (!res.writableEnded) {
            return res.status(200).json({ responseText: `Error: ${e.message || 'Error desconocido'}. 🧐`, stage: 'error' });
        }
    }
}
