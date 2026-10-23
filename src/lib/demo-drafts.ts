/** Per-tab composer drafts only; never include this cache in project exports. */
export const DEMO_DRAFTS_KEY = 'vibekidding-demo-drafts-v1';
export const MAX_DRAFT_CHARACTERS = 2000;
export const MAX_DRAFT_CACHE_BYTES = 220_000;
export type DraftCache = { version: 1; activeProjectId: string | null; drafts: {projectId: string | null; text: string}[] };
export const emptyDrafts = (): DraftCache => ({version:1,activeProjectId:null,drafts:[]});
const validId = (id: unknown): id is string | null => id === null || typeof id === 'string' && !!id.trim() && id.length <= 128;
const allowed = (id: string | null, ids: readonly string[]) => id === null || ids.slice(0,24).includes(id);
function prune(cache: DraftCache, ids: readonly string[]): DraftCache {
  return {version:1,activeProjectId:allowed(cache.activeProjectId,ids)?cache.activeProjectId:null,drafts:cache.drafts.filter(d=>allowed(d.projectId,ids))};
}
export function parseDrafts(raw: string | null, projectIds: readonly string[]): DraftCache {
  if (raw === null) return emptyDrafts();
  if (raw.length > MAX_DRAFT_CACHE_BYTES || new TextEncoder().encode(raw).length > MAX_DRAFT_CACHE_BYTES) throw new Error('Draft cache is unavailable.');
  let value;
  try { value=JSON.parse(raw); } catch { throw new Error('Draft cache is unavailable.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'activeProjectId,drafts,version' || value.version !== 1 || !validId(value.activeProjectId) || !Array.isArray(value.drafts) || value.drafts.length > 25) throw new Error('Draft cache is unavailable.');
  const seen = new Set<string | null>();
  for (const draft of value.drafts) {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft) || Object.keys(draft).sort().join(',') !== 'projectId,text' || !validId(draft.projectId) || typeof draft.text !== 'string' || draft.text.length > MAX_DRAFT_CHARACTERS || seen.has(draft.projectId)) throw new Error('Draft cache is unavailable.');
    seen.add(draft.projectId);
  }
  return prune(value,projectIds);
}
export function draftText(cache: DraftCache): string { return cache.drafts.find(d=>d.projectId===cache.activeProjectId)?.text ?? ''; }
export function selectDraft(cache: DraftCache, projectId: string | null, projectIds: readonly string[]): DraftCache {
  if (!validId(projectId) || !allowed(projectId,projectIds)) throw new Error('Draft project is unavailable.');
  return {...prune(cache,projectIds),activeProjectId:projectId};
}
export function writeDraft(cache: DraftCache, text: string, projectIds: readonly string[]): DraftCache {
  if (typeof text !== 'string' || text.length > MAX_DRAFT_CHARACTERS) throw new Error('Draft is too long.');
  const next=prune(cache,projectIds);
  return {...next,drafts:[...next.drafts.filter(d=>d.projectId!==next.activeProjectId),...(text ? [{projectId:next.activeProjectId,text}] : [])]};
}
export function encodeDrafts(cache: DraftCache): string {
  const raw=JSON.stringify(cache);
  // Validate the complete cache, including records that would otherwise be pruned.
  parseDrafts(raw,cache.drafts.flatMap(d=>d.projectId===null?[]:[d.projectId]));
  return raw;
}
