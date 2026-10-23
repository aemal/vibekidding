import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const validId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const MAX_LOG = 128 * 1024;
const reservedEnvironment = new Set(['PORT', 'HOST', 'HOSTNAME', 'DATA_DIR', 'BASE_PATH', 'NODE_ENV', 'NODE_OPTIONS', 'NODE_PATH', 'PATH', 'HOME', 'LD_PRELOAD', 'LD_LIBRARY_PATH']);

export async function readProjectEnvironment(root, projectId) {
  let values;
  try { values = JSON.parse(await fs.readFile(path.join(root, 'projects', projectId, 'environment.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('Application environment configuration could not be read'); }
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 100) throw new Error('Application environment must contain at most 100 named settings');
  for (const [name, value] of Object.entries(values)) {
    if (name.length > 128 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || reservedEnvironment.has(name.toUpperCase()) || name.toUpperCase().startsWith('VIBEKIDDING_')) throw new Error(`Application environment setting name is reserved or invalid: ${name}`);
    if (typeof value !== 'string' || Buffer.byteLength(value) > 8192 || /[\r\n\0]/.test(value)) throw new Error(`Application environment setting must be a single-line string: ${name}`);
  }
  return values;
}

export function docker(args, { input, timeout = 120000, onOutput } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      const text = chunk.toString();
      output = (output + text).slice(-MAX_LOG);
      onOutput?.(text);
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(new Error(timedOut ? 'Docker operation timed out' : output.trim() || `Docker exited ${code}`));
    });
    child.stdin.end(input);
  });
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function body(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (Buffer.byteLength(text) > 32 * 1024) throw new Error('Request is too large');
  }
  return JSON.parse(text || '{}');
}

function authorized(request, token) {
  const actual = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return token.length >= 24 && actual.length === expected.length && timingSafeEqual(actual, expected);
}

function appRequestHeaders(headers) {
  const result = { ...headers };
  if (result.cookie) {
    const cookies = String(result.cookie).split(';').map(cookie => cookie.trim()).filter(cookie => !/^vk_studio_session\s*=/i.test(cookie));
    if (cookies.length) result.cookie = cookies.join('; ');
    else delete result.cookie;
  }
  return result;
}

function appResponseHeaders(headers) {
  const result = { ...headers };
  if (result['set-cookie']) {
    const cookies = (Array.isArray(result['set-cookie']) ? result['set-cookie'] : [result['set-cookie']]).filter(cookie => !/^vk_studio_session\s*=/i.test(cookie.trim()));
    if (cookies.length) result['set-cookie'] = cookies;
    else delete result['set-cookie'];
  }
  return result;
}

export async function validateSource(root, projectId, versionId, supplied) {
  if (!validId.test(projectId || '') || !validId.test(versionId || '')) throw new Error('Invalid project or version ID');
  const expected = path.join(root, 'projects', projectId, 'versions', versionId, 'source');
  if (supplied && path.resolve(supplied) !== expected) throw new Error('Source path does not match project version');
  const real = await fs.realpath(expected);
  const canonicalExpected = path.join(await fs.realpath(root), 'projects', projectId, 'versions', versionId, 'source');
  if (real !== canonicalExpected) throw new Error('Source directory cannot be a symlink');
  const inspect = async directory => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Source cannot include symbolic links');
      if (entry.isDirectory()) {
        if (['node_modules', '.git'].includes(entry.name)) throw new Error('Source contains generated dependencies or Git metadata');
        await inspect(path.join(directory, entry.name));
      }
      if (entry.name === '.env' || entry.name.startsWith('.env.')) throw new Error('Source cannot include environment secret files');
    }
  };
  await inspect(real);
  const pkg = JSON.parse(await fs.readFile(path.join(real, 'package.json'), 'utf8'));
  if (!pkg.scripts?.start) throw new Error('Project must define an npm start script');
  return real;
}

export function runtimeConfiguration(options = {}) {
  const publicMode = options.publicMode ?? (process.env.VIBEKIDDING_PUBLIC_MODE === '1');
  const raw = options.runtimeOrigin ?? process.env.VIBEKIDDING_RUNTIME_ORIGIN ?? '';
  const studioRaw = options.studioOrigin ?? process.env.PUBLIC_ORIGIN ?? '';
  const parse = value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Runtime and studio URLs must be HTTP(S) origins without paths or credentials');
    }
    return url;
  };
  const runtime = raw ? parse(raw) : null;
  const studio = studioRaw ? parse(studioRaw) : null;
  if (publicMode && (!runtime || !studio || runtime.hostname === studio.hostname)) {
    throw new Error('Public mode requires a separate runtime hostname and PUBLIC_ORIGIN');
  }
  if (runtime && studio && runtime.hostname === studio.hostname) throw new Error('Runtime hostname must differ from studio hostname');
  return { publicMode, runtimeOrigin: runtime?.origin || '', runtimeHost: runtime?.host || '' };
}

export async function createController(options = {}) {
  const runtimeConfig = runtimeConfiguration(options);
  const appPath = projectId => `/apps/${projectId}/`;
  const appUrl = projectId => {
    if (!runtimeConfig.runtimeOrigin) return appPath(projectId);
    const url = new URL(runtimeConfig.runtimeOrigin);
    url.hostname = `${projectId.toLowerCase()}.${url.hostname}`;
    url.pathname = appPath(projectId);
    return url.href;
  };
  const runtimeRequestAllowed = (request, pathname) => {
    const projectId = pathname.split('/')[2];
    if (!validId.test(projectId || '')) return false;
    if (!runtimeConfig.runtimeOrigin) return !runtimeConfig.publicMode;
    const expected = new URL(appUrl(projectId)).host;
    if (request.headers.host === expected) return true;
    // Direct local integration tests remain possible on the studio hostname.
    return !runtimeConfig.publicMode && !String(request.headers.host || '').includes('.apps.');
  };
  const root = path.resolve(options.root || process.env.VIBEKIDDING_DATA_DIR || '/var/lib/vibekidding');
  const token = options.token || process.env.VIBEKIDDING_CONTROLLER_TOKEN || '';
  if (token.length < 24) throw new Error('VIBEKIDDING_CONTROLLER_TOKEN must contain at least 24 characters');
  const run = options.docker || docker;
  const networkPrefix = options.networkPrefix || process.env.VIBEKIDDING_APP_NETWORK_PREFIX || 'vibekidding-project-';
  const controllerContainer = options.controllerContainer || process.env.HOSTNAME || 'vibekidding-controller-1';
  const appPort = options.appPort || 3000;
  const volumePrefix = process.env.VIBEKIDDING_APP_VOLUME_PREFIX || 'vibekidding-data-';
  const memory = process.env.VIBEKIDDING_APP_MEMORY || '512m';
  const cpus = process.env.VIBEKIDDING_APP_CPUS || '1';
  const timeout = Number(process.env.VIBEKIDDING_BUILD_TIMEOUT_MS || 600000);
  const stateDir = path.join(root, 'controller');
  await fs.mkdir(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, 'state.json');
  let state = { deployments: {}, routes: {} };
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const deployment of Object.values(state.deployments)) {
    deployment.url = appUrl(deployment.projectId);
    if (['queued', 'building', 'starting'].includes(deployment.status)) {
      deployment.status = 'failed';
      deployment.error = 'Controller restarted during deployment; retry publishing this version.';
    }
  }
  let saving = Promise.resolve();
  const save = () => {
    const snapshot = JSON.stringify(state, null, 2);
    saving = saving.catch(() => {}).then(async () => {
      await fs.writeFile(`${stateFile}.tmp`, snapshot, { mode: 0o600 });
      await fs.rename(`${stateFile}.tmp`, stateFile);
    });
    return saving;
  };
  await save();
  let queue = Promise.resolve();
  const log = (deployment, text) => { deployment.logs = (deployment.logs + text).slice(-MAX_LOG); };

  const waitHealthy = options.waitHealthy || (async container => {
    for (let attempt = 0; attempt < 45; attempt++) {
      try {
        const response = await fetch(`http://${container}:${appPort}/`, { signal: AbortSignal.timeout(1500) });
        if (response.status < 500) return;
      } catch { /* App may still be starting. */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Application did not become ready on port 3000 within 45 seconds');
  });

  async function connectToProjectNetwork(projectId, containerToMigrate) {
    const network = `${networkPrefix}${projectId.toLowerCase()}`;
    try { await run(['network', 'create', '--label', 'vibekidding.managed=true', '--label', `vibekidding.project=${projectId}`, network]); }
    catch { await run(['network', 'inspect', network]); }
    async function connect(container) {
      try { await run(['network', 'connect', network, container]); }
      catch (error) {
        const connected = JSON.parse(await run(['inspect', '--format', '{{json .NetworkSettings.Networks}}', container]));
        if (!connected[network]) throw error;
      }
    }
    await connect(controllerContainer);
    if (containerToMigrate) {
      await connect(containerToMigrate);
      const connected = JSON.parse(await run(['inspect', '--format', '{{json .NetworkSettings.Networks}}', containerToMigrate]));
      for (const previous of Object.keys(connected)) {
        if (previous !== network) await run(['network', 'disconnect', previous, containerToMigrate]);
      }
    }
    return network;
  }

  // Upgrade existing managed runtimes in place without changing names or data.
  // In public mode a failed isolation migration prevents serving any traffic.
  if (runtimeConfig.publicMode) {
    for (const [projectId, route] of Object.entries(state.routes)) {
      await connectToProjectNetwork(projectId, route.container);
    }
  }

  async function deploy(deployment, source) {
    const container = `vk-${deployment.projectId.toLowerCase()}-${deployment.id.slice(0, 8)}`;
    const image = `vibekidding/app:${deployment.id}`;
    const volume = `${volumePrefix}${deployment.projectId.toLowerCase()}`;
    const previous = state.routes[deployment.projectId];
    const context = path.join(stateDir, 'builds', deployment.id);
    const lockFile = path.join(stateDir, 'locks', deployment.projectId, `${deployment.versionId}.json`);
    const lockContainer = `vk-lock-${deployment.id.slice(0, 8)}`;
    const runtimeEnv = path.join(stateDir, 'environment', `${deployment.id}.env`);
    let published = false;
    try {
      deployment.status = 'building';
      await save();
      const environment = await readProjectEnvironment(root, deployment.projectId);
      await fs.mkdir(path.dirname(context), { recursive: true });
      await fs.cp(source, context, { recursive: true });
      try { await fs.copyFile(lockFile, path.join(context, 'package-lock.json')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const dockerfile = await fs.readFile(path.join(here, 'app.Dockerfile'), 'utf8');
      await run(['build', '--label', 'vibekidding.managed=true', '--build-arg', `APP_BASE_PATH=${appPath(deployment.projectId)}`, '-t', image, '-f', '-', context], {
        input: dockerfile, timeout, onOutput: text => log(deployment, text),
      });
      // Preserve the resolved dependency tree outside the immutable source.
      // Restoring/rebuilding this version can then use npm ci even when the
      // generated source originally omitted a lockfile.
      await fs.mkdir(path.dirname(lockFile), { recursive: true });
      await run(['create', '--name', lockContainer, '--label', 'vibekidding.managed=true', '--label', `vibekidding.project=${deployment.projectId}`, image]);
      try { await run(['cp', `${lockContainer}:/app/package-lock.json`, lockFile]); }
      finally { await run(['rm', '-f', lockContainer]); }
      await run(['volume', 'create', '--label', 'vibekidding.managed=true', '--label', `vibekidding.project=${deployment.projectId}`, volume]);
      // New Docker volumes start root-owned. This trusted helper touches only
      // the new app's data mount, never its source or another application's data.
      await run(['run', '--rm', '--user', '0:0', '--entrypoint', 'chown', '-v', `${volume}:/data`, image, '1000:1000', '/data']);
      const network = await connectToProjectNetwork(deployment.projectId);
      deployment.status = 'starting';
      await save();
      await fs.mkdir(path.dirname(runtimeEnv), { recursive: true });
      await fs.writeFile(runtimeEnv, Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
      await run(['run', '-d', '--name', container, '--label', 'vibekidding.managed=true', '--label', `vibekidding.project=${deployment.projectId}`,
        '--network', network, '--restart', 'unless-stopped', '--memory', memory, '--cpus', cpus, '--pids-limit', '256',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--user', '1000:1000',
        '--log-driver', 'json-file', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2',
        '--env-file', runtimeEnv, '-e', 'PORT=3000', '-e', 'HOST=0.0.0.0', '-e', 'HOSTNAME=0.0.0.0', '-e', 'DATA_DIR=/data',
        '-e', `BASE_PATH=${appPath(deployment.projectId)}`, '-v', `${volume}:/data`, image]);
      await waitHealthy(container);
      deployment.status = 'ready';
      deployment.container = container;
      deployment.image = image;
      deployment.volume = volume;
      deployment.finishedAt = new Date().toISOString();
      state.routes[deployment.projectId] = { container, deploymentId: deployment.id, preservePrefix: deployment.preservePrefix };
      await save();
      published = true;
      if (previous?.container && previous.container !== container) {
        try { await run(['rm', '-f', previous.container]); }
        catch (error) { log(deployment, `\nPrevious container cleanup: ${error.message}\n`); }
      }
      await save().catch(error => console.error('Could not persist deployment cleanup log:', error.message));
    } catch (error) {
      if (published) return;
      if (previous) state.routes[deployment.projectId] = previous;
      else delete state.routes[deployment.projectId];
      deployment.status = 'failed';
      deployment.error = error.message.slice(-4096);
      deployment.finishedAt = new Date().toISOString();
      try { log(deployment, `\n${await run(['logs', '--tail', '60', container])}\n`); } catch { /* May not have started. */ }
      try { await run(['rm', '-f', container]); } catch { /* May not have started. */ }
      await save().catch(writeError => console.error('Could not persist failed deployment:', writeError.message));
    } finally {
      await fs.rm(context, { recursive: true, force: true }).catch(error => console.error('Could not clean build context:', error.message));
      await fs.rm(runtimeEnv, { force: true }).catch(error => console.error('Could not remove temporary runtime environment:', error.message));
    }
  }

  function route(url) {
    const match = /^\/apps\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,79})(\/.*)?$/.exec(url.pathname);
    if (!match) return null;
    const target = state.routes[match[1]];
    if (!target) return null;
    return { ...target, path: (target.preservePrefix ? url.pathname : match[2] || '/') + url.search };
  }

  function proxy(request, response, target) {
    const upstream = http.request({ hostname: target.container, port: appPort, method: request.method, path: target.path,
      headers: { ...appRequestHeaders(request.headers), host: request.headers.host || target.container, 'x-forwarded-prefix': `/apps/${new URL(request.url, 'http://localhost').pathname.split('/')[2]}` } }, result => {
      response.writeHead(result.statusCode, appResponseHeaders(result.headers));
      result.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) json(response, 502, { error: 'Application is not responding. Try republishing it.' }); else response.destroy(); });
    request.on('aborted', () => upstream.destroy());
    request.pipe(upstream);
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://controller');
      if (url.pathname.startsWith('/apps/')) {
        if (!runtimeRequestAllowed(request, url.pathname)) return json(response, 404, { error: 'Use the runtime origin' });
        const target = route(url);
        if (!target) return json(response, 404, { error: 'Application has not been published' });
        return proxy(request, response, target);
      }
      if (url.pathname === '/healthz' || url.pathname === '/health') return json(response, 200, { ok: true });
      if (!authorized(request, token)) return json(response, 401, { error: 'Controller authentication required' });
      if (request.method === 'GET' && url.pathname === '/status') {
        try { await run(['info', '--format', '{{.ServerVersion}}'], { timeout: 5000 }); }
        catch { return json(response, 503, { ready: false, error: 'Docker engine is unavailable' }); }
        return json(response, 200, { ready: true, queued: Object.values(state.deployments).filter(d => ['queued', 'building', 'starting'].includes(d.status)).length });
      }
      if (request.method === 'POST' && url.pathname === '/unpublish') {
        const data = await body(request);
        if (!validId.test(data.projectId || '')) throw new Error('Invalid project ID');
        if (Object.values(state.deployments).some(d => d.projectId === data.projectId && ['queued', 'building', 'starting'].includes(d.status))) {
          return json(response, 409, { error: 'Wait for the active deployment before unpublishing' });
        }
        const current = state.routes[data.projectId];
        if (current) {
          await run(['rm', '-f', current.container]);
          delete state.routes[data.projectId];
          await save();
        }
        return json(response, 200, { unpublished: Boolean(current), dataPreserved: true });
      }
      if (request.method === 'POST' && url.pathname === '/deploy') {
        const data = await body(request);
        if (runtimeConfig.runtimeOrigin && !/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(data.projectId || '')) throw new Error('Runtime project ID must be a lowercase DNS label of 2–63 characters');
        const source = await validateSource(root, data.projectId, data.versionId, data.sourcePath);
        const active = Object.values(state.deployments).find(d => d.projectId === data.projectId && ['queued', 'building', 'starting'].includes(d.status));
        if (active) return json(response, 409, { error: 'This application already has a deployment in progress', deploymentId: active.id });
        const id = randomUUID();
        const deployment = { id, deploymentId: id, projectId: data.projectId, versionId: data.versionId, status: 'queued',
          url: appUrl(data.projectId), preservePrefix: data.preservePrefix === true, createdAt: new Date().toISOString(), logs: '' };
        state.deployments[id] = deployment;
        await save();
        queue = queue.catch(() => {}).then(() => deploy(deployment, source));
        return json(response, 202, deployment);
      }
      const match = /^\/deployments\/([a-f0-9-]+)$/.exec(url.pathname);
      if (request.method === 'GET' && match) {
        const deployment = state.deployments[match[1]];
        return json(response, deployment ? 200 : 404, deployment || { error: 'Deployment not found' });
      }
      return json(response, 404, { error: 'Endpoint not found' });
    } catch (error) { json(response, 400, { error: error.message }); }
  });

  server.on('upgrade', (request, socket, head) => {
    if (!runtimeRequestAllowed(request, new URL(request.url, 'http://controller').pathname)) return socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    const target = route(new URL(request.url, 'http://controller'));
    if (!target) return socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    const upstream = http.request({ hostname: target.container, port: appPort, method: request.method, path: target.path, headers: appRequestHeaders(request.headers) });
    upstream.on('upgrade', (response, appSocket, appHead) => {
      const headers = Object.entries(appResponseHeaders(response.headers)).flatMap(([key, value]) => Array.isArray(value) ? value.map(v => `${key}: ${v}`) : [`${key}: ${value}`]);
      socket.write(`HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}\r\n${headers.join('\r\n')}\r\n\r\n`);
      if (appHead.length) socket.write(appHead);
      if (head.length) appSocket.write(head);
      socket.pipe(appSocket).pipe(socket);
      appSocket.on('error', () => socket.destroy());
      socket.on('error', () => appSocket.destroy());
      socket.on('close', () => appSocket.destroy());
    });
    upstream.on('response', response => { response.resume(); socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'); });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.end();
  });
  return { server, state, idle: () => queue };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = await createController();
  server.listen(Number(process.env.PORT || 4000), '0.0.0.0', () => console.log('VibeKidding deployment controller listening'));
}
