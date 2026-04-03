
import jwt from 'jsonwebtoken';
import fs from 'fs';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-nova-estetica-key';

const payload = {
    id: 'demo-id',
    username: 'demo',
    role: 'staff'
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
fs.writeFileSync('scripts/token.txt', token);
console.log('Token saved to scripts/token.txt');
