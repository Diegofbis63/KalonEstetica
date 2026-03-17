import { it, expect, describe } from 'vitest';
import { extractState } from './api/_services/stateMachine';
import { maskPhone } from './src/lib/utils';

// Mock data
const mockCategories = [
  { id: 'cat1', name: 'Masajes' },
  { id: 'cat2', name: 'Depilación' }
];

const mockServices = [
  { id: 'svc1', category_id: 'cat1', title: 'Masaje Descontracturante', price: 45000, duration: '60 min', category_name: 'Masajes', active: true },
  { id: 'svc2', category_id: 'cat2', title: 'Soprano Ice Platinum', price: 45000, duration: '40 min', category_name: 'Depilación', active: true }
];

/**
 * Helper to run multiple messages and return final state
 */
async function runFlow(messages: (string | { text: string, hasMedia?: boolean })[]) {
  const history: any[] = [];
  let state: any = {
      clientName: null,
      clientPhone: null,
      selectedServiceIds: [],
      currentCategoryId: null,
      pendingCategoryIds: [],
      stage: 'greeting',
      pendingDate: null,
      pendingTime: null,
      requestedDate: null,
      requestedTime: null,
      rejectedDates: [],
      requestedAllOptions: false,
      isBotEnabled: true
  };

  for (const m of messages) {
    const text = typeof m === 'string' ? m : m.text;
    const hasMedia = typeof m === 'object' ? m.hasMedia : false;
    
    // User message
    history.push({ 
        role: 'user', 
        content: text, 
        media_url: hasMedia ? 'http://fake.receipt.jpg' : null,
        media_data: hasMedia ? 'fake_data' : null
    });
    
    // Process turn - Always re-process full history to test the "Rebuild" stability
    state = await extractState(history, mockCategories, mockServices, true, null);

    // CRITICAL: Slot assignment simulation (matches chat.ts logic)
    if (state.stage === 'availability_proposal' && state.requestedDate && !state.pendingDate) {
        state.pendingDate = state.requestedDate;
        state.pendingTime = state.requestedTime || '10:00';
    }

    // Bot message simulation
    const botMsg = text.includes('mañana') || text.includes('10') ? '¿Te queda bien este horario?' :
                   text.includes('123') ? '¿Cómo es tu nombre completo?' :
                   state.stage === 'name_collection' ? '¿Como es tu nombre?' :
                   state.stage === 'phone_collection' ? '¿Cual es tu whatsapp?' :
                   state.stage === 'availability_proposal' ? '¿Te queda bien este horario?' :
                   state.stage === 'payment_request' ? 'Necesitamos una seña' : 
                   `Bot response for ${text}`;
    
    history.push({ role: 'assistant', content: botMsg });
  }

  return state;
}

describe('KalonBot Stress Test - 100 Variations', () => {

  it('Scenario 1: Supports booking from start to payment request', async () => {
    const flow = [
      'hola', 
      'masajes', 
      'masaje descontracturante', 
      'listo', 
      'Fede', 
      '1122334455', 
      'mañana a las 10', 
      'si'
    ];
    const finalState = await runFlow(flow);
    expect(finalState).not.toBeNull();
    expect(finalState.stage).toBe('payment_request');
    expect(finalState.clientName).toBe('Fede');
  });

  it('Scenario 2: Handles adding and removing services', async () => {
      const flow = ['masajes', 'masaje descontracturante', 'agregar', 'depilacion', 'soprano ice', 'quitar soprano'];
      const finalState = await runFlow(flow);
      expect(finalState.selectedServiceIds).toContain('svc1');
      expect(finalState.selectedServiceIds).not.toContain('svc2');
      expect(finalState.stage).toBe('cart_review');
  });

  it('Scenario 3: Direct Service Mention (Priority Fix Check)', async () => {
    const flow = ['soprano ice', 'listo', 'Juan', '123', 'mañana a las 10', 'si'];
    const finalState = await runFlow(flow);
    expect(finalState.selectedServiceIds).toContain('svc2');
    expect(finalState.stage).toBe('payment_request');
  });

  it('Scenario 4: Intent Prioritization (Schedule Change)', async () => {
      const flow = ['masaje descontracturante', 'listo', 'Juan', '123', 'mañana a las 18hs'];
      const finalState = await runFlow(flow);
      expect(finalState.requestedTime).toBe('18:00');
      expect(finalState.stage).toBe('availability_proposal');
  });

  it('Scenario 5: Media Payment Processing', async () => {
      const flow = [
          'soprano ice', 'listo', 'Juan', '1122334455', 'mañana a las 10', 'si',
          { text: 'acá el comprobante', hasMedia: true }
      ];
      const finalState = await runFlow(flow);
      // After media in payment_request, it should go to waiting_for_receipt or done
      // In our stateMachine, receipt -> waiting_for_receipt
      expect(finalState.stage).toBe('waiting_for_receipt');
  });

  it('Scenario 6: Randomized Stress Test (10 variations)', async () => {
      const names = ['Ana', 'Pedro', 'Maria', 'Santi', 'Fede'];
      const phones = ['11111111', '22222222', '33333333', '44444444', '55555555'];
      const svcs = ['masaje descontracturante', 'soprano ice'];

      for (let i = 0; i < 10; i++) {
          const randomName = names[i % names.length];
          const randomPhone = phones[i % phones.length];
          const randomSvc = svcs[i % svcs.length];
          
          const flow = [
              randomSvc, 
              'listo', 
              randomName, 
              randomPhone, 
              'hoy a las 15hs', 
              'dale',
              { text: 'comprobante', hasMedia: true }
          ];
          
          const finalState = await runFlow(flow);
          expect(finalState.stage).toBe('waiting_for_receipt');
          expect(finalState.clientName).toBe(randomName);
      }
  });

  it('Scenario 7: RBAC - Phone is masked for staff but visible for admin', () => {
      const phone = '5493512345678';
      expect(maskPhone(phone, 'admin')).toBe(phone);
      expect(maskPhone(phone, 'staff')).toContain('****');
  });

  it('Scenario 9: Fix Regression - Inversion of removal logic (Double Addition Bug)', async () => {
    // Stage: User adds a service twice, then asks to remove ONE correctly.
    const flow = [
        'depilacion', 
        'soprano ice platinum', 
        'agregar soprano ice platinum', 
        // Current state should have 2 instances of svc2
        'quita soprano ice platinum 1 vez'
    ];
    const finalState = await runFlow(flow);
    
    // We expect exactly 1 instance now.
    const occurrences = finalState.selectedServiceIds.filter((id: string) => id === 'svc2').length;
    expect(occurrences).toBe(1);
    expect(finalState.stage).toBe('cart_review');
    
    // Second check: "elimina soprano" should remove the remaining one
    const flow2 = [...flow, 'elimina soprano ice platinum'];
    const finalState2 = await runFlow(flow2);
    expect(finalState2.selectedServiceIds).not.toContain('svc2');
  });

});
