import { db } from '../api/_services/db.ts';
import * as schema from '../api/_services/schema.ts';

async function findAdmin() {
  const users = await db.select().from(schema.admin_users);
  console.log('Admin Users:', JSON.stringify(users, null, 2));
  process.exit(0);
}

findAdmin().catch(err => {
  console.error(err);
  process.exit(1);
});
