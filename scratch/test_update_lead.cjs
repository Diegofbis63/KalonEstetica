const { updateLeadState, db, schema } = require('../api/_services/db.js');
const { eq } = require('drizzle-orm');
require('dotenv').config({ path: '.env.local' });

async function main() {
  // Let's find Silvia's lead id first
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.client_name, 'Silvia Valeri'));
  console.log("FOUND LEADS:", leads);
  if (leads.length > 0) {
    const lead = leads[0];
    console.log("Current intent_score:", lead.intent_score);
    console.log("Current state:", lead.current_state);
    
    // Test updating state
    console.log("Testing updateLeadState to stage 3...");
    await updateLeadState(lead.id, { ...lead.current_state, stage: '3' });
    
    const updated = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    console.log("Updated intent_score:", updated[0].intent_score);
    console.log("Updated state:", updated[0].current_state);
  }
}

main().catch(console.error);
