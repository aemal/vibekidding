// Real Docker acceptance. Requires the Compose controller and gateway running.
// Creates only an isolated generated fixture app and removes its own artifacts.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = process.env.VIBEKIDDING_STACK_ENV || path.join(root, 'infra/local/stack.env');
const origin = process.argv[2] || 'http://localhost:3000';
const projectId = `infra-smoke-${Date.now()}`;
const compose = ['compose', '--project-directory', root, '--env-file', env, '-f', path.join(root, 'compose.yaml')];
function command(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}
function inside(script) { return command([...compose, 'exec', '-T', 'controller', 'node', '--input-type=module', '-'], script); }
function api(endpoint, payload) {
  return JSON.parse(inside(`const response=await fetch('http://127.0.0.1:4000'+${JSON.stringify(endpoint)}, {method:${payload ? "'POST'" : "'GET'"},headers:{authorization:'Bearer '+process.env.VIBEKIDDING_CONTROLLER_TOKEN,'content-type':'application/json'},${payload ? `body:JSON.stringify(${JSON.stringify(payload)})` : ''}});const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));console.log(JSON.stringify(result));`));
}
const deployments = [];
const source = version => `import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';
const db=new DatabaseSync(process.env.DATA_DIR+'/fixture.sqlite');
db.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER); INSERT OR IGNORE INTO counter VALUES(1,0)');
const server=http.createServer((req,res)=>{
 if(req.url==='/counter') { if(req.method==='POST')db.exec('UPDATE counter SET value=value+1 WHERE id=1');res.setHeader('content-type','application/json');res.end(JSON.stringify(db.prepare('SELECT value FROM counter WHERE id=1').get())); }
 else {res.setHeader('content-type','text/html');res.end('<h1>Docker fixture ${version}</h1>');}
});
new WebSocketServer({server}).on('connection',socket=>socket.on('message',data=>socket.send('echo:'+data)));
server.listen(3000,'0.0.0.0');`;
function write(versionId, broken = false) {
  const files = { 'package.json': JSON.stringify({ type: 'module', scripts: { build: broken ? 'node -e "process.exit(42)"' : 'node --check server.mjs', start: 'node server.mjs' }, dependencies: { ws: '^8.18.3' } }), 'server.mjs': source(versionId) };
  inside(`import {promises as fs} from 'node:fs';const root=process.env.VIBEKIDDING_DATA_DIR+'/projects/'+${JSON.stringify(projectId)}+'/versions/'+${JSON.stringify(versionId)}+'/source';await fs.mkdir(root,{recursive:true});for(const[name,text]of Object.entries(${JSON.stringify(files)}))await fs.writeFile(root+'/'+name,text);`);
}
async function publish(version, expected) {
  const deployment = api('/deploy', { projectId, versionId: version });
  deployments.push(deployment.id);
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    const status = api(`/deployments/${deployment.id}`);
    if (['ready', 'failed'].includes(status.status)) {
      assert.equal(status.status, expected, status.error || status.logs);
      return status;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error('Timed out waiting for real Docker deployment');
}

try {
  assert.equal(api('/status').ready, true);
  write('one');
  await publish('one', 'ready');
  const app = `${origin}/apps/${projectId}/`;
  assert.match(await fetch(app).then(r => r.text()), /Docker fixture one/);
  assert.deepEqual(await fetch(`${app}counter`, { method: 'POST' }).then(r => r.json()), { value: 1 });
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(app.replace(/^http/, 'ws'));
    const timeout = setTimeout(() => { socket.close(); reject(new Error('WebSocket echo timed out')); }, 10000);
    socket.onopen = () => socket.send('hello');
    socket.onmessage = event => { try { assert.equal(event.data, 'echo:hello'); clearTimeout(timeout); socket.close(); resolve(); } catch (error) { reject(error); } };
    socket.onerror = reject;
  });
  write('two');
  await publish('two', 'ready');
  assert.match(await fetch(app).then(r => r.text()), /Docker fixture two/);
  assert.deepEqual(await fetch(`${app}counter`).then(r => r.json()), { value: 1 });
  write('broken', true);
  await publish('broken', 'failed');
  assert.match(await fetch(app).then(r => r.text()), /Docker fixture two/);
  assert.deepEqual(await fetch(`${app}counter`).then(r => r.json()), { value: 1 });
  const hasLock = inside(`import fs from 'node:fs';console.log(fs.existsSync(process.env.VIBEKIDDING_DATA_DIR+'/controller/locks/'+${JSON.stringify(projectId)}+'/two.json'));`);
  assert.equal(hasLock, 'true');
  console.log(JSON.stringify({ realDocker: true, build: 'passed', sqliteAcrossRevision: 'passed', webSocketThroughNginx: 'passed', failedRevisionKeepsLiveApp: 'passed', savedDependencyLock: 'passed', projectId }));
} finally {
  api('/unpublish', { projectId });
  const ids = command(['ps', '-aq', '--filter', `label=vibekidding.project=${projectId}`]).split('\n').filter(Boolean);
  if (ids.length) command(['rm', '-f', ...ids]);
  for (const id of deployments) { try { command(['image', 'rm', `vibekidding/app:${id}`]); } catch { /* A failed build may not create an image. */ } }
  try { command(['volume', 'rm', `vibekidding-data-${projectId}`]); } catch { /* No volume if first build failed. */ }
  try {
    const controllerId = command([...compose, 'ps', '-q', 'controller']);
    command(['network', 'disconnect', `vibekidding-project-${projectId}`, controllerId]);
    command(['network', 'rm', `vibekidding-project-${projectId}`]);
  } catch { /* A failed first build may never create a network. */ }
  // Test metadata remains as an explicit acceptance trace; only this fixture's
  // runtime, images, and application data are disposable.
}
