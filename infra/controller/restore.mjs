import { promises as fs } from 'node:fs';
import path from 'node:path';
const file = path.join(process.env.VIBEKIDDING_DATA_DIR || '/var/lib/vibekidding', 'controller', 'restore-plan.json');
let plan;
try { plan = JSON.parse(await fs.readFile(file, 'utf8')); }
catch (error) { if (error.code === 'ENOENT') { console.log('No restored deployments to rebuild.'); process.exit(0); } throw error; }
const headers = { authorization: `Bearer ${process.env.VIBEKIDDING_CONTROLLER_TOKEN}`, 'content-type': 'application/json' };
for (const item of plan) {
  const response = await fetch('http://127.0.0.1:4000/deploy', { method: 'POST', headers, body: JSON.stringify(item) });
  const created = await response.json();
  if (!response.ok) throw new Error(`Cannot restore ${item.projectId}: ${created.error}`);
  const deadline = Date.now() + Number(process.env.VIBEKIDDING_BUILD_TIMEOUT_MS || 600000) + 120000;
  for (;;) {
    const status = await fetch(`http://127.0.0.1:4000/deployments/${created.id}`, { headers }).then(r => r.json());
    if (status.status === 'ready') { console.log(`Restored ${item.projectId}: ${status.url}`); break; }
    if (status.status === 'failed') throw new Error(`Restore failed for ${item.projectId}: ${status.error}`);
    if (Date.now() > deadline) throw new Error(`Restore timed out for ${item.projectId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
await fs.rename(file, `${file}.completed`);
