// Restores backup archives into disposable Docker volumes, never live volumes.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory = path.resolve(process.argv[2] || 'infra/backups/docker-acceptance-20261023');
const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.format, 1);
assert.ok(manifest.volumes['vibekidding-projects.tgz']);
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Docker restore check failed');
  return result.stdout.trim();
}
const results = [];
for (const [archive, digest] of Object.entries(manifest.volumes)) {
  assert.match(archive, /^vibekidding-(?:projects|data-[a-zA-Z0-9_-]+)\.tgz$/);
  assert.equal(createHash('sha256').update(readFileSync(path.join(directory, archive))).digest('hex'), digest);
  // Use the same no-traversal/no-link boundary as the restore script before tar.
  const validation = spawnSync('python3', ['-c', `import tarfile,pathlib,sys
with tarfile.open(sys.argv[1]) as archive:
 for item in archive.getmembers():
  p=pathlib.PurePosixPath(item.name)
  if p.is_absolute() or '..' in p.parts or item.issym() or item.islnk(): raise ValueError('Unsafe archive member')`, path.join(directory, archive)], { encoding: 'utf8' });
  if (validation.status !== 0) throw new Error('Backup archive failed path validation');
  const volume = `vibekidding-restore-check-${randomUUID()}`;
  try {
    docker(['volume', 'create', '--label', 'vibekidding.acceptance=restore', volume]);
    docker(['run', '--rm', '--network', 'none', '-v', `${volume}:/target`, '-v', `${directory}:/backup:ro`, 'alpine:3.21', 'tar', 'xzf', `/backup/${archive}`, '-C', '/target']);
    const script = `const fs=require('node:fs'),path=require('node:path');const {DatabaseSync}=require('node:sqlite');let files=0,databases=0;function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else{files++;if(/\\.(sqlite|db)$/.test(entry.name)){const db=new DatabaseSync(file);if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw Error('Restored database integrity failed');db.close();databases++;}}}}walk('/data');if(!files)throw Error('Archive restored no files');console.log(JSON.stringify({files,databases,integrity:'ok'}));`;
    const result = JSON.parse(docker(['run', '--rm', '--network', 'none', '-v', `${volume}:/data`, 'node:22-bookworm-slim', 'node', '-e', script]));
    results.push({ archive, ...result });
  } finally { docker(['volume', 'rm', volume]); }
}
console.log(JSON.stringify({ isolatedDockerRestore: 'passed', liveVolumesChanged: false, results }, null, 2));
