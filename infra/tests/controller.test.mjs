import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createController, validateSource, readProjectEnvironment, runtimeConfiguration } from '../controller/server.mjs';

const token = 'test-controller-token-that-is-long-enough';
async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'vk-controller-')));
  const source = path.join(root, 'projects', 'project-one', 'versions', 'version-one', 'source');
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ scripts: { start: 'node server.mjs' } }));
  return { root, source };
}

test('controller accepts only the matching source tree with no symlinks or env files', async t => {
  const { root, source } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(await validateSource(root, 'project-one', 'version-one', source), source);
  await assert.rejects(validateSource(root, '../other', 'version-one'), /Invalid/);
  await assert.rejects(validateSource(root, 'project-one', 'version-one', '/etc'), /does not match/);
  await fs.symlink('/etc/passwd', path.join(source, 'secret'));
  await assert.rejects(validateSource(root, 'project-one', 'version-one'), /symbolic/);
  await fs.unlink(path.join(source, 'secret'));
  await fs.writeFile(path.join(source, '.env.local'), 'SECRET=hidden');
  await assert.rejects(validateSource(root, 'project-one', 'version-one'), /environment/);
});

test('deployment requires auth, becomes ready, and a failed revision preserves the live route and durable volume', async t => {
  const { root, source } = await fixture();
  const calls = [];
  let failBuild = false;
  const controller = await createController({ root, token, runtimeOrigin: 'http://apps.localhost:3230', studioOrigin: 'http://localhost:3230', docker: async (args, options) => {
    calls.push(args);
    if (args[0] === 'build' && failBuild) throw new Error('Fixture build error');
    options?.onOutput?.('build output\n');
    return 'fixture';
  }, waitHealthy: async () => {} });
  await new Promise(resolve => controller.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${controller.server.address().port}`;
  t.after(async () => { await new Promise(resolve => controller.server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  const payload = { projectId: 'project-one', versionId: 'version-one', sourcePath: source };
  assert.equal((await fetch(`${origin}/deploy`, { method: 'POST', body: JSON.stringify(payload) })).status, 401);
  const response = await fetch(`${origin}/deploy`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  assert.equal(response.status, 202);
  const initial = await response.json();
  assert.equal(initial.url, 'http://project-one.apps.localhost:3230/apps/project-one/');
  await controller.idle();
  assert.equal(controller.state.deployments[initial.id].status, 'ready');
  const route = controller.state.routes['project-one'];
  const appRun = calls.find(args => args[0] === 'run' && args.includes('-d'));
  assert.ok(appRun.includes('vibekidding-data-project-one:/data'));
  assert.ok(!appRun.some(arg => arg.includes('docker.sock')));
  assert.ok(appRun.includes('1000:1000'));
  assert.ok(appRun.includes('--memory'));
  assert.ok(appRun.includes('vibekidding-project-project-one'));
  assert.ok(calls.some(args => args[0] === 'network' && args[1] === 'connect' && args[2] === 'vibekidding-project-project-one'));
  assert.ok(appRun.includes('BASE_PATH=/apps/project-one/'));
  assert.ok(calls.find(args => args[0] === 'build').includes('APP_BASE_PATH=/apps/project-one/'));
  failBuild = true;
  const failed = await fetch(`${origin}/deploy`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const revision = await failed.json();
  await controller.idle();
  assert.equal(controller.state.deployments[revision.id].status, 'failed');
  assert.equal(controller.state.routes['project-one'].container, route.container);
  const stored = JSON.parse(await fs.readFile(path.join(root, 'controller', 'state.json'), 'utf8'));
  assert.equal(stored.routes['project-one'].container, route.container);
  const unpublished = await fetch(`${origin}/unpublish`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ projectId: 'project-one' }) });
  assert.deepEqual(await unpublished.json(), { unpublished: true, dataPreserved: true });
  assert.equal(controller.state.routes['project-one'], undefined);
  assert.ok(!calls.some(args => args[0] === 'volume' && args[1] === 'rm'));
});

test('restart marks interrupted deployments failed and preserves published routes', async t => {
  const { root } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'controller'));
  await fs.writeFile(path.join(root, 'controller', 'state.json'), JSON.stringify({
    deployments: { pending: { status: 'building' } }, routes: { app: { container: 'previous-live' } },
  }));
  const controller = await createController({ root, token });
  assert.equal(controller.state.deployments.pending.status, 'failed');
  assert.equal(controller.state.routes.app.container, 'previous-live');
});

test('runtime settings reject system overrides and use an env file without leaking values into deployment records or Docker arguments', async t => {
  const { root, source } = await fixture();
  const file = path.join(root, 'projects', 'project-one', 'environment.json');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.deepEqual(await readProjectEnvironment(root, 'project-one'), {});
  await fs.writeFile(file, JSON.stringify({ PORT: '8888' }));
  await assert.rejects(readProjectEnvironment(root, 'project-one'), /reserved/);
  await fs.writeFile(file, JSON.stringify({ TOKEN: 'line1\nline2' }));
  await assert.rejects(readProjectEnvironment(root, 'project-one'), /single-line/);
  const secret = 'fixture-private-api-token-should-not-leak';
  await fs.writeFile(file, JSON.stringify({ EXTERNAL_API_KEY: secret }));
  const calls = [];
  let injected;
  const controller = await createController({ root, token, waitHealthy: async () => {}, docker: async args => {
    calls.push(args);
    if (args.includes('--env-file')) injected = await fs.readFile(args[args.indexOf('--env-file') + 1], 'utf8');
    return '';
  } });
  await new Promise(resolve => controller.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => controller.server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${controller.server.address().port}/deploy`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ projectId: 'project-one', versionId: 'version-one', sourcePath: source }) });
  assert.equal(response.status, 202);
  await controller.idle();
  assert.equal(injected, `EXTERNAL_API_KEY=${secret}\n`);
  assert.ok(!JSON.stringify(calls).includes(secret));
  assert.ok(!JSON.stringify(controller.state).includes(secret));
  assert.deepEqual(await fs.readdir(path.join(root, 'controller', 'environment')), []);
});

test('HTTP and WebSocket proxies preserve app cookies but withhold the studio session and reject its overwrite', async t => {
  const { root } = await fixture();
  const requests = [];
  const appSockets = new Set();
  const app = http.createServer((request, response) => {
    requests.push(request.headers.cookie);
    response.writeHead(200, { 'set-cookie': ['game_state=next; Path=/', 'vk_studio_session=overwritten; Path=/'] });
    response.end('app');
  });
  app.on('upgrade', (request, socket) => {
    appSockets.add(socket);
    socket.on('close', () => appSockets.delete(socket));
    socket.on('end', () => socket.destroy());
    requests.push(request.headers.cookie);
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSet-Cookie: game_state=socket\r\nSet-Cookie: vk_studio_session=socket-overwrite\r\n\r\n');
    socket.on('data', () => {});
  });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const controller = await createController({ root, token, appPort: app.address().port, publicMode: true, studioOrigin: 'https://studio.example', runtimeOrigin: 'https://apps.example' });
  controller.state.routes['project-one'] = { container: '127.0.0.1' };
  await new Promise(resolve => controller.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of appSockets) socket.destroy(); controller.server.closeAllConnections(); app.closeAllConnections(); await Promise.all([new Promise(resolve => controller.server.close(resolve)), new Promise(resolve => app.close(resolve))]); await fs.rm(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${controller.server.address().port}/apps/project-one/`;
  const cookie = 'game_state=original; vk_studio_session=private-platform-session; preference=blue';
  const get = host => new Promise((resolve, reject) => {
    http.get(base, { headers: { cookie, host } }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body, cookies: response.headers['set-cookie'] }));
    }).on('error', reject);
  });
  assert.equal((await get('studio.example')).status, 404);
  assert.equal((await get('project-two.apps.example')).status, 404);
  assert.equal((await get('apps.example')).status, 404);
  const response = await get('project-one.apps.example');
  assert.equal(response.body, 'app');
  assert.deepEqual(response.cookies, ['game_state=next; Path=/']);
  await new Promise((resolve, reject) => {
    const request = http.request(base, { headers: { host: 'project-two.apps.example', Connection: 'Upgrade', Upgrade: 'websocket' } });
    request.on('response', response => { response.resume(); try { assert.equal(response.statusCode, 404); resolve(); } catch (error) { reject(error); } });
    request.on('upgrade', (_response, socket) => { socket.destroy(); reject(new Error('Cross-project WebSocket upgrade was accepted')); });
    request.on('error', reject); request.end();
  });
  await new Promise((resolve, reject) => {
    const request = http.request(base, { headers: { cookie, host: 'project-one.apps.example', Connection: 'Upgrade', Upgrade: 'websocket' } });
    request.on('upgrade', (response, socket) => {
      try { assert.deepEqual(response.headers['set-cookie'], ['game_state=socket']); socket.destroy(); resolve(); }
      catch (error) { socket.destroy(); reject(error); }
    });
    request.on('error', reject);
    request.end();
  });
  assert.deepEqual(requests, ['game_state=original; preference=blue', 'game_state=original; preference=blue']);
});


test('public runtime configuration fails closed without a distinct hostname', () => {
  assert.throws(() => runtimeConfiguration({ publicMode: true, runtimeOrigin: '', studioOrigin: 'https://studio.example' }), /separate runtime hostname/);
  assert.throws(() => runtimeConfiguration({ publicMode: true, runtimeOrigin: 'https://studio.example:4000', studioOrigin: 'https://studio.example' }), /separate runtime hostname/);
  assert.throws(() => runtimeConfiguration({ publicMode: true, runtimeOrigin: 'https://apps.example/path', studioOrigin: 'https://studio.example' }), /without paths/);
  assert.deepEqual(runtimeConfiguration({ publicMode: true, runtimeOrigin: 'https://apps.example', studioOrigin: 'https://studio.example' }), { publicMode: true, runtimeOrigin: 'https://apps.example', runtimeHost: 'apps.example' });
});

test('public restart moves existing runtimes off shared networks and stops startup if isolation fails', async t => {
  const { root } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'controller'));
  await fs.writeFile(path.join(root, 'controller', 'state.json'), JSON.stringify({ deployments: {}, routes: { 'project-one': { container: 'old-live-container' } } }));
  const calls = [];
  const options = { root, token, publicMode: true, runtimeOrigin: 'https://apps.example', studioOrigin: 'https://studio.example', controllerContainer: 'trusted-controller' };
  await createController({ ...options, docker: async args => {
    calls.push(args);
    return args[0] === 'inspect' ? JSON.stringify({ 'vibekidding-apps': {}, 'vibekidding-project-project-one': {} }) : '';
  } });
  assert.ok(calls.some(args => JSON.stringify(args) === JSON.stringify(['network', 'connect', 'vibekidding-project-project-one', 'trusted-controller'])));
  assert.ok(calls.some(args => JSON.stringify(args) === JSON.stringify(['network', 'connect', 'vibekidding-project-project-one', 'old-live-container'])));
  assert.ok(calls.some(args => JSON.stringify(args) === JSON.stringify(['network', 'disconnect', 'vibekidding-apps', 'old-live-container'])));
  await assert.rejects(createController({ ...options, docker: async args => {
    if (args[0] === 'network' && args[1] === 'disconnect') throw new Error('network isolation unavailable');
    return args[0] === 'inspect' ? JSON.stringify({ 'vibekidding-apps': {} }) : '';
  } }), /network isolation unavailable/);
});
