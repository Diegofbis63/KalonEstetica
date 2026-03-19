
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
        
        console.log(`[chat.ts] Message: "${incomingMessage}", User: ${userId}`);

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

        // 2. FETCH DATA (Parallel)
        const [categories, services] = await Promise.all([
            getCategories(),
            getActiveServices()
        ]);
        
        // 3. IDENTIFY/CREATE LEAD (Unified DB Persistence)
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
            
            // Try to find lead using Drizzle
            let lead = normalizedPhone.length >= 8 ? await findLeadByFlexiblePhone(normalizedPhone) : null;
            
            if (!lead) {
                // Secondary search by JSON metadata
                const results = await db.query.leads.findMany({
                    where: or(
                        drizzleSql`contact_info->>'uuid' = ${idStr}`,
                        drizzleSql`contact_info->>'phone' = ${idStr}`
                    ),
                    limit: 1
                });
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
            } else {
                // Create Lead immediately if not found
                const isPhone = /^\d+$/.test(idStr) && idStr.length < 15;
                const contactInfo = isPhone 
                    ? { phone: idStr, source: userId ? 'whatsapp' : 'web' }
                    : { uuid: idStr, source: 'web' };

                const newLead = await createLead(DEFAULT_ORG_ID, 'Cliente', contactInfo);
                leadId = newLead.id;
            }
        }

        // 4. BUILD CONVERSATION CONTEXT
        const messages = body.messages || [];
        if (!messages.length && incomingMessage) {
            messages.push({ role: 'user', content: incomingMessage, media_url: incomingMediaUrl });
        }
        
        // 5. EXTRACT STATE (DB State is King)
        const state = await extractState(messages, categories, services, isBotEnabled, leadName, leadPhone, savedState, lastUpdate);

        // 6. IMMEDIATE STEP-BY-STEP PERSISTENCE (NAME + PHONE + STATE = SOURCE OF TRUTH)
        if (leadId) {
            const nameToSync = state.clientName && state.clientName !== 'Cliente' ? state.clientName : leadName;
            const phoneToSync = state.clientPhone || leadPhone;
            
            // Critical Update: Name, Phone, and State must be synchronized step by step
            if (nameToSync !== leadName || phoneToSync !== leadPhone) {
                const updatedContact = { phone: phoneToSync, name: nameToSync };
                await db.update(schema.leads)
                        .set({ client_name: nameToSync, contact_info: updatedContact, updated_at: new Date() })
                        .where(eq(schema.leads.id, leadId));
            }

            await updateLeadState(leadId, state);
            await insertChatLog(leadId, 'user', incomingMessage, incomingMediaUrl, !!userId, body.mediaData);
        }

        if (!isBotEnabled) {
            console.log("[chat.ts] Bot is disabled. Exiting.");
            return res.status(200).json({ status: 'bot_disabled' });
        }

        // 7. AVAILABILITY SEARCH
        const foundSlots: { date: string, time: string }[] = [];
        let timeWasAdjusted = false;
        let eligibleStaff: { id: string, work_start: string | null, work_end: string | null }[] = [];

        if (state.stage === 'availability_proposal' && state.selectedServiceIds.length > 0) {
            const selectedSvcObjs = services.filter(s => state.selectedServiceIds.includes(s.id));
            const currentCatId = selectedSvcObjs[0]?.category_id;
            
            if (currentCatId) {
                // 1. Check if ANY staff is assigned to this category (Source of Truth)
                const assignedStaff = await getStaffBySpecialty(currentCatId);
                eligibleStaff = assignedStaff; // Keep for the generateResponse logic

                if (assignedStaff.length > 0) {
                    const nowArg = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Cordoba"}));
                    const todayStr = nowArg.getFullYear() + "-" + String(nowArg.getMonth() + 1).padStart(2, '0') + "-" + String(nowArg.getDate()).padStart(2, '0');
                    
                    // 2. Define search range (Today/Requested -> +14 days)
                    const searchStart = state.requestedDate ? new Date(state.requestedDate + "T00:00:00") : new Date(nowArg);
                    searchStart.setHours(0,0,0,0);
                    
                    const searchEnd = new Date(searchStart);
                    searchEnd.setDate(searchEnd.getDate() + 14);

                    // 3. FETCH PRE-CALCULATED SLOTS FROM NEON (Cerebro en Neon)
                    const slots = await getAvailableSlotsFromDB(currentCatId, searchStart, searchEnd);
                    
                    // 4. POST-FILTER (Time logic, business rules)
                    const limit = state.requestedAllOptions ? 3 : 1;
                    
                    for (const s of slots) {
                        const slotDate = new Date(s.slot_time);
                        const dateStr = slotDate.toISOString().split('T')[0];
                        
                        // Use consistent Argentina timezone for time string and comparisons
                        const timeStr = new Intl.DateTimeFormat('en-US', { 
                            timeZone: 'America/Argentina/Cordoba', 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            hour12: false 
                        }).format(slotDate);
                        
                        // Rule: Don't propose past times today
                        if (dateStr === todayStr) {
                            const [sh, sm] = timeStr.split(':').map(Number);
                            const currentMinutes = nowArg.getHours() * 60 + nowArg.getMinutes();
                            const slotMinutes = sh * 60 + sm;
                            if (slotMinutes < currentMinutes + 30) continue;
                        }

                        // Rule: Respect requested time if first match
                        if (state.requestedTime && foundSlots.length === 0 && dateStr === state.requestedDate) {
                             if (timeStr < state.requestedTime) continue;
                        }

                        if (state.rejectedDates.includes(`${dateStr} ${timeStr}`)) continue;

                        foundSlots.push({ date: dateStr, time: timeStr });
                        if (foundSlots.length >= limit) break;
                    }
                }
            }

            if (foundSlots.length > 0) {
                const reqD = state.requestedDate;
                const reqT = state.requestedTime;
                
                if (reqD && foundSlots[0].date !== reqD) timeWasAdjusted = true;
                if (reqT && foundSlots[0].time !== reqT) timeWasAdjusted = true;
                
                state.pendingDate = foundSlots[0].date;
                state.pendingTime = foundSlots[0].time;
                
                if (leadId) await updateLeadState(leadId, state);
            }
        }

        // 8. BOOKING CONFIRMATION 
        const hasArrivalMedia = !!(incomingMediaUrl || body.mediaData);
        const isReceiptTurn = state.stage === 'waiting_for_receipt' || state.stage === 'payment_request';
        
        if (isReceiptTurn && (hasArrivalMedia || incomingMessage?.toLowerCase().includes("comprobante"))) {
            if (leadId) {
                const selectedSvcObjs = services.filter(s => state.selectedServiceIds.includes(s.id));
                
                if (!state.pendingDate || !state.pendingTime) {
                   state.pendingDate = savedState?.pendingDate || state.requestedDate;
                   state.pendingTime = savedState?.pendingTime || state.requestedTime;
                }

                if (state.pendingDate && state.pendingTime && selectedSvcObjs.length > 0) {
                    const catNames = Array.from(new Set(selectedSvcObjs.map(s => s.category_name || "Servicio"))).join(' + ');
                    const totalPrice = selectedSvcObjs.reduce((a, b) => a + Math.round(Number(b.price)), 0);
                    const totalDur = selectedSvcObjs.reduce((a, b) => a + parseDuration(b.duration), 0);
                    const dateTime = `${state.pendingDate}T${state.pendingTime}:00-03:00`;
                    
                    try {
                        await createAppointment(leadId, DEFAULT_ORG_ID, dateTime, catNames, totalPrice, totalDur, selectedSvcObjs);
                        state.stage = 'done';
                        await markLeadAsConverted(leadId);
                    } catch (appErr) {
                        console.error("[chat.ts] Error inserting appointment:", appErr);
                        state.stage = 'payment_request';
                    }
                } else {
                    state.stage = 'payment_request';
                }
            }
        }

        // 9. GENERATE RESPONSE
        const noStaff = (state.stage === 'availability_proposal' && (!eligibleStaff || eligibleStaff.length === 0));
        const responseText = generateResponse(
            state, 
            categories, 
            services, 
            foundSlots, 
            !!userId, 
            !!(incomingMediaUrl || body.mediaData), 
            timeWasAdjusted,
            noStaff
        );
        
        if (leadId) {
            await updateLeadState(leadId, state);
            await insertChatLog(leadId, 'bot', responseText, null, !!userId);
        }

        // 10. SEND RESPONSE
        if (userId) {
            return res.status(200).json({ 
                responseText: formatForWhatsApp(responseText), 
                stage: state.stage 
            });
        } else {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            const words = responseText.split(' ');
            for (let i = 0; i < words.length; i++) {
                const chunk = (i === 0 ? '' : ' ') + words[i];
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
    } catch (e: unknown) {
        console.error("[chat.ts] CRITICAL ERROR:", e);
        if (!res.writableEnded) {
            return res.status(200).json({ 
                responseText: "Hubo un pequeño error procesando tu solicitud, ¿podrías repetirlo? 😊", 
                stage: 'error' 
            });
        }
    }
}
