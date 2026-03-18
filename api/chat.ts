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

        // 8. IMMEDIATE STEP-BY-STEP PERSISTENCE (NAME + PHONE + STATE = SOURCE OF TRUTH)
        // Rule: As soon as we have ANY data, we write it to the DB so it's visible in the Dashboard instantly.
        if (leadId) {
            const nameToSync = state.clientName && state.clientName !== 'Cliente' ? state.clientName : leadName;
            const phoneToSync = state.clientPhone || leadPhone;
            
            // Critical Update: Name, Phone, and State must be synchronized step by step
            if (nameToSync !== leadName || phoneToSync !== leadPhone) {
                console.log(`[chat.ts] Rule #1: Step-by-step Sync for lead ${leadId} ("${nameToSync}" / "${phoneToSync}")`);
                const updatedContact = { name: nameToSync, phone: phoneToSync };
                await sql`UPDATE leads SET client_name = ${nameToSync}, contact_info = contact_info || ${JSON.stringify(updatedContact)}, updated_at = NOW() WHERE id = ${leadId}`;
            }

            await updateLeadState(leadId, state);
            await insertChatLog(leadId, 'user', incomingMessage, incomingMediaUrl, !!userId, body.mediaData);
        }

        if (!isBotEnabled) {
            console.log("[chat.ts] Bot is disabled for this lead. Exiting.");
            return res.status(200).json({ status: 'bot_disabled' });
        }

        // 9. AVAILABILITY SEARCH (Rule #3: FIX FECHA URGENTE)
        const foundSlots: any[] = [];
        let timeWasAdjusted = false;
        if (state.stage === 'availability_proposal' && state.selectedServiceIds.length > 0) {
            console.log("[chat.ts] Calculating availability slots...");
            const selectedSvcObjs = services.filter(s => state.selectedServiceIds.includes(s.id));
            const totalDur = selectedSvcObjs.reduce((a, b) => a + parseDuration(b.duration), 0);
            
            // Rule #3: HOY es HOY en Argentina (GMT-3)
            const nowArg = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Cordoba"}));
            const todayStr = nowArg.getFullYear() + "-" + String(nowArg.getMonth() + 1).padStart(2, '0') + "-" + String(nowArg.getDate()).padStart(2, '0');
            
            // Ensure baseDate is never in the past
            let baseDate = state.requestedDate ? new Date(state.requestedDate + "T12:00:00Z") : new Date(nowArg.getTime());
            
            // If the user requested a date in the past, or no date was requested, start from tomorrow (or today if early)
            const requestedDateStr = baseDate.toISOString().split('T')[0];
            if (requestedDateStr < todayStr) {
                console.log(`[chat.ts] Requested date ${requestedDateStr} is in the past. Reverting to today/tomorrow.`);
                baseDate = new Date(nowArg);
            }

            if (!state.requestedDate) {
                baseDate.setDate(baseDate.getDate() + 1); // Default to tomorrow if not specified
            } else {
                // If requested today but we are past 20:00, push to tomorrow
                if (requestedDateStr === todayStr && nowArg.getHours() >= 20) {
                    baseDate.setDate(baseDate.getDate() + 1);
                    console.log("[chat.ts] Past 20:00 GMT-3. Forcing search to tomorrow.");
                }
            }

            const limit = state.requestedAllOptions ? 3 : 1;

            for (let d = 0; d < 30 && foundSlots.length < limit; d++) {
                const searchDate = new Date(baseDate);
                searchDate.setDate(baseDate.getDate() + d);
                
                if (searchDate.getDay() === 0) continue; 
                const dateStr = searchDate.toISOString().split('T')[0];
                if (dateStr < todayStr) continue; // Final safety check

                const taken = await getAppointmentsForDate(dateStr);
                const takenIntervals = taken.map(r => {
                    const start = new Date(r.date_time);
                    const argTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Cordoba', hour: '2-digit', minute: '2-digit', hour12: false }).format(start);
                    const [h, m] = argTime.split(':').map(Number);
                    const startMin = h * 60 + m;
                    return { start: startMin, end: startMin + 60 };
                });

                let startSearch = 9 * 60;
                if (dateStr === todayStr) {
                    // Only buffer if it's today and the requested time is very close
                    const currentMinutes = nowArg.getHours() * 60 + nowArg.getMinutes(); 
                    startSearch = Math.max(9 * 60, currentMinutes);
                }

                if (state.requestedTime && d === 0 && dateStr === requestedDateStr) {
                    const [rh, rm] = state.requestedTime.split(':').map(Number);
                    startSearch = Math.max(startSearch, rh * 60 + rm);
                    // Special case: if they asked for exactly right now (early), allow it if they really want it.
                }

                // Rule #3: Precision in end time (20:00 strictly = 1200 mins)
                for (let totalMin = startSearch; totalMin <= 1200 - totalDur; totalMin += 30) {
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
                    
                    if (!overlaps && potentialEnd <= 1200) {
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
                
                state.pendingDate = foundSlots[0].date;
                state.pendingTime = foundSlots[0].time;
                
                // Rule #4 Anti-Undefined: Update DB state immediately so the generator sees it
                if (leadId) await updateLeadState(leadId, state);
            }
        }

        // 10. BOOKING CONFIRMATION (Media receipt)
        // Rule #4: Final check before confirmation to prevent undefined values
        const hasArrivalMedia = !!(incomingMediaUrl || body.mediaData);
        const isReceiptTurn = state.stage === 'waiting_for_receipt' || state.stage === 'payment_request';
        
        if (isReceiptTurn && (hasArrivalMedia || incomingMessage?.toLowerCase().includes("comprobante"))) {
            if (leadId) {
                console.log("[chat.ts] Media search triggered (Media: " + hasArrivalMedia + ")");
                const selectedSvcObjs = services.filter(s => state.selectedServiceIds.includes(s.id));
                
                // If we are in the receipt turns and have ANY data, we MUST recover the date/time if lost
                if (!state.pendingDate || !state.pendingTime) {
                   console.log("[chat.ts] CRITICAL: Recovering pending date/time from savedState for lead " + leadId);
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
                        console.log(`[chat.ts] Success in creation for lead ${leadId} at ${dateTime}`);
                        state.stage = 'done';
                        await markLeadAsConverted(leadId);
                    } catch (appErr) {
                        console.error("[chat.ts] CRITICAL: Error inserting appointment:", appErr);
                        state.stage = 'payment_request';
                    }
                } else {
                    console.log("[chat.ts] WARNING: Missing booking data for lead " + leadId + " during receipt.");
                    state.stage = 'payment_request';
                }
            }
        }

        // 11. GENERATE RESPONSE
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
