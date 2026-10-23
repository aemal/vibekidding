import { validProjects, type Project } from '../components/demo/project-backup';
import { decodeShareFragment, DemoShareError, MAX_SHARE_PAYLOAD_BYTES, MAX_SHARE_TITLE_CHARACTERS, MAX_SHARE_URL_CHARACTERS, type SharedBuild } from './demo-share';

export type SharedCopyIdentity = Readonly<{ projectId: string; versionId: string; createdAt: number }>;
const invalid = (): never => { throw new DemoShareError('invalid-payload'); };

/** Explicit workshop handoff only. Reading a fragment never stores or runs HTML. */
export async function parseCopyFragment(fragment: string): Promise<SharedBuild> {
  if (typeof fragment !== 'string' || !fragment.startsWith('#copy=')) throw new DemoShareError('invalid-link');
  if (fragment.length > MAX_SHARE_URL_CHARACTERS + 5) throw new DemoShareError('too-large');
  return decodeShareFragment('#' + fragment.slice(6));
}

/** Pure construction. The caller supplies fresh identities and a timestamp and owns saving. */
export function createSharedCopy(build: SharedBuild, identity: SharedCopyIdentity): Project {
  if (!build || typeof build.title !== 'string' || !build.title.trim() || typeof build.html !== 'string' || !build.html.trim()) return invalid();
  if (build.title.length > MAX_SHARE_TITLE_CHARACTERS || build.html.length > MAX_SHARE_PAYLOAD_BYTES ||
      new TextEncoder().encode(JSON.stringify({v:1,title:build.title,html:build.html})).byteLength > MAX_SHARE_PAYLOAD_BYTES) throw new DemoShareError('too-large');
  if (!identity || typeof identity.projectId !== 'string' || !identity.projectId.trim() || identity.projectId.length > 128 ||
      typeof identity.versionId !== 'string' || !identity.versionId.trim() || identity.versionId.length > 128 || identity.projectId === identity.versionId ||
      !Number.isSafeInteger(identity.createdAt) || identity.createdAt < 0 || identity.createdAt > 8_640_000_000_000_000) return invalid();
  const project: Project = {
    id: identity.projectId, title: build.title, emoji: '✦', updatedAt: identity.createdAt,
    versions: [{id:identity.versionId,html:build.html,prompt:'Imported shared snapshot',createdAt:identity.createdAt,mode:'shared'}],
  };
  if (!validProjects([project])) return invalid();
  return project;
}
