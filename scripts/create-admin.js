// Usage: npm run admin:create -- owner@example.com "Full Name" [owner|staff]
// The password is read from ADMIN_PASSWORD or prompted for (never passed as an argument).
import readline from 'node:readline';
import { createAdmin } from '../src/services/auth.js';

const [email, name = '', role = 'owner'] = process.argv.slice(2);
if (!email) { console.error('Usage: npm run admin:create -- <email> ["Full Name"] [owner|staff]'); process.exit(1); }

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); };
  const a = await new Promise(r => rl.question(q, r)); rl.close(); process.stdout.write('\n'); return a;
}

const password = process.env.ADMIN_PASSWORD || await ask('Password (min 12 characters): ');
try {
  await createAdmin({ email, name, password, role: role === 'staff' ? 'staff' : 'owner' });
  console.log(`Admin ${email} created (${role}).`);
} catch (err) { console.error(err.message); process.exit(1); }
