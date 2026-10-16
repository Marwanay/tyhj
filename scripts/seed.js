// Migrates the database and seeds the launch product (also happens automatically on first request).
import { bootstrap } from '../src/services/bootstrap.js';
import { close } from '../src/db.js';
await bootstrap();
console.log('Database ready — “The Signature Chocolate Tray” is seeded (visible, not yet purchasable until its selling details are completed in the admin).');
await close();
