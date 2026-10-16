// Runs a command against a real, throwaway Postgres server (embedded-postgres), to test the
// production database driver locally:  node scripts/with-postgres.mjs npm test
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-pg-'));
fs.chmodSync(parent, 0o777); // Postgres refuses to run as root, so it runs as a separate user
const dir = path.join(parent, 'data');
const port = 54329;
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'cc', password: 'cc', port, persistent: false, onLog: () => {} });
await pg.initialise();
await pg.start();
let status = 1;
try {
  const runOnce = (name, cmd) => {
    return pg.createDatabase(name).then(() => spawnSync(cmd[0], cmd.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: `postgres://cc:cc@localhost:${port}/${name}`, TEST_DATABASE_URL: `postgres://cc:cc@localhost:${port}/${name}` },
    }).status);
  };
  status = await runOnce(`cc_${Date.now()}`, process.argv.slice(2));
} finally {
  await pg.stop();
  fs.rmSync(parent, { recursive: true, force: true });
}
process.exit(status ?? 1);
