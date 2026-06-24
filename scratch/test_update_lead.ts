import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { updateLeadState, db, schema } = await import('../api/_services/db.js');
  const { eq } = await import('drizzle-orm');

  if (!db) {
    console.error("DB connection is still null! Check your environment variables.");
    process.exit(1);
  }
  
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.client_name, 'Silvia Valeri'));
  console.log("FOUND LEADS:", leads);
  if (leads.length > 0) {
    const lead = leads[0];
    console.log("Current intent_score:", lead.intent_score);
    console.log("Current state:", lead.current_state);
    
    console.log("Testing updateLeadState to stage 3...");
    await updateLeadState(lead.id, { ...lead.current_state, stage: '3' });
    
    const updated = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    console.log("Updated intent_score:", updated[0].intent_score);
    console.log("Updated state:", updated[0].current_state);
  }
}

main().catch(console.error);
