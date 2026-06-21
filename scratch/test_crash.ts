import { processChat } from '../api/_chat/engine.ts';

const reqBody = {
    messages: [{ role: 'user', content: 'josefina gomez' }]
};

const res = {
    write: (data: string) => console.log('WRITE:', data),
    end: () => console.log('END'),
    status: (code: number) => ({ json: (d: any) => console.log('ERROR:', code, d) }),
    setHeader: () => {},
    flushHeaders: () => {}
};

processChat(reqBody, res as any).catch(console.error);
