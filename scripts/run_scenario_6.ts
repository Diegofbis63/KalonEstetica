import { extractState } from '../api/_services/stateMachine';

const mockCategories = [
  { id: 'cat1', name: 'Masajes' },
  { id: 'cat2', name: 'Depilación' }
];

const mockServices = [
  { id: 'svc1', category_id: 'cat1', title: 'Masaje Descontracturante', price: 45000, duration: '60 min', category_name: 'Masajes', active: true },
  { id: 'svc2', category_id: 'cat2', title: 'Soprano Ice Platinum', price: 45000, duration: '40 min', category_name: 'Depilación', active: true }
];

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
      
      history.push({ 
          role: 'user', 
          content: text, 
          media_url: hasMedia ? 'http://fake.receipt.jpg' : null,
          media_data: hasMedia ? 'fake_data' : null
      });
      
      state = await extractState(history, mockCategories as any, mockServices as any, true, null);
  
      if (state.stage === 'availability_proposal' && state.requestedDate && !state.pendingDate) {
          state.pendingDate = state.requestedDate;
          state.pendingTime = state.requestedTime || '10:00';
      }
  
      const botMsg = text.includes('mañana') || text.includes('10') ? '¿Te queda bien este horario?' :
                     text.includes('123') ? '¿Cómo es tu nombre completo?' :
                     state.stage === 'name_collection' ? '¿Como es tu nombre?' :
                     state.stage === 'phone_collection' ? '¿Cual es tu whatsapp?' :
                     state.stage === 'availability_proposal' ? '¿Te queda bien este horario?' :
                     state.stage === 'payment_request' ? 'Necesitamos una seña' : 
                     `Bot response for ${text}`;
      
      history.push({ role: 'assistant', content: botMsg });
      console.log(`[runFlow] After '${text}', state.clientName = ${state.clientName}, state.stage = ${state.stage}`);
    }
  
    return state;
  }
  
async function run() {
    const names = ['Ana', 'Pedro', 'Maria', 'Santi', 'Fede'];
    const phones = ['11111111', '22222222', '33333333', '44444444', '55555555'];
    const svcs = ['masaje descontracturante', 'soprano ice'];

    const flow = [
        svcs[0], 
        'listo', 
        names[0], 
        phones[0], 
        'hoy a las 15hs', 
        'dale',
        { text: 'comprobante', hasMedia: true }
    ];
    
    await runFlow(flow);
}

run();
