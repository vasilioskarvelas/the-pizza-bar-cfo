// Phase 14 — Entity restore from a backup directory (external, Node 20+).
// Restores in dependency order. Does NOT overwrite existing records by id;
// bulkCreate generates new ids. Manual review required for FK remapping.
//
// Usage: node scripts/restore-entities.mjs backups/<timestamp>
// Env: BASE44_API_KEY, BASE44_APP_ID
// WARNING: restore into an ISOLATED tenant only.

import { createClient } from '@base44/sdk';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const S = createClient({ apiKey: process.env.BASE44_API_KEY, appId: process.env.BASE44_APP_ID });
const dir = process.argv[2];
if (!dir || !existsSync(dir)) { console.error('Usage: node scripts/restore-entities.mjs <backup-dir>'); process.exit(1); }

const manifest = JSON.parse(await readFile(`${dir}/MANIFEST.json`, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const entry of manifest.entities) {
    if (!entry.count) continue;
    const rows = JSON.parse(await readFile(`${dir}/${entry.file}`, 'utf8'));
    const clean = rows.map(({ id, created_date, updated_date, created_by_id, ...rest }) => rest);
    let ok = 0, fail = 0;
    for (let i = 0; i < clean.length; i += 500) {
      try { await S.entities[entry.entity].bulkCreate(clean.slice(i, i + 500)); ok += clean.slice(i, i + 500).length; }
      catch (e) { fail++; console.error(`restore ${entry.entity} batch: ${e.message}`); }
      await sleep(120);
    }
    console.log(`${entry.entity}: restored ${ok} (fail ${fail})`);
    console.log('NOTE: relationship ids (organisation_id, site_id, *_id FKs) point to ORIGINAL ids —');
    console.log('      remap manually if restoring cross-tenant, or restore into the same tenant.');
  }
  console.log('\nRestore complete. Validate counts vs MANIFEST.json.');
})();