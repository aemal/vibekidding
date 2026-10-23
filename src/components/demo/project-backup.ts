export type Version = { id: string; html: string; prompt: string; createdAt: number; mode: "ai" | "template" };
export type Project = { id: string; title: string; emoji: string; updatedAt: number; versions: Version[] };
export const MAX_PROJECTS = 24;
export const MAX_VERSIONS = 20;
export const MAX_HTML = 350_000;
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const FORMAT = "vibekidding-project";
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number, allowEmpty = false): value is string => typeof value === "string" && value.length <= max && (allowEmpty || !!value.trim());
const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
function validProject(value: unknown): value is Project {
  if (!record(value) || !text(value.id, 128) || !text(value.title, 70) || !text(value.emoji, 32) || !timestamp(value.updatedAt) || !Array.isArray(value.versions) || !value.versions.length || value.versions.length > MAX_VERSIONS) return false;
  const ids = new Set<string>();
  return value.versions.every(v => {
    if (!record(v) || !text(v.id, 128) || ids.has(v.id) || !text(v.html, MAX_HTML) || !text(v.prompt, 4000, true) || !timestamp(v.createdAt) || (v.mode !== "ai" && v.mode !== "template")) return false;
    ids.add(v.id);
    return true;
  });
}
export function validProjects(value: unknown): value is Project[] {
  return Array.isArray(value) && value.length <= MAX_PROJECTS && value.every(validProject) && new Set(value.map(p => p.id)).size === value.length;
}
function cleanProject(project: Project): Project {
  return { id: project.id, title: project.title, emoji: project.emoji, updatedAt: project.updatedAt, versions: project.versions.map(v => ({ id: v.id, html: v.html, prompt: v.prompt, createdAt: v.createdAt, mode: v.mode })) };
}
export function serializeBackup(project: Project): string {
  if (!validProject(project)) throw new Error("This project could not be backed up. Export its HTML to keep the current version.");
  const result = JSON.stringify({ format: FORMAT, version: 1, project: cleanProject(project) });
  if (new TextEncoder().encode(result).byteLength > MAX_BACKUP_BYTES) throw new Error("This project is too large for an 8 MB backup. Export its current HTML instead.");
  return result;
}
export function parseBackup(source: string): Project {
  if (new TextEncoder().encode(source).byteLength > MAX_BACKUP_BYTES) throw new Error("That backup is too large. Choose a JSON backup smaller than 8 MB.");
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error("That file isn’t valid JSON. Choose a VibeKidding project backup (.json)."); }
  if (!record(value) || value.format !== FORMAT) throw new Error("That file isn’t a VibeKidding project backup. Use Export backup to create one.");
  if (value.version !== 1) throw new Error("This backup version isn’t supported. Please use a version 1 VibeKidding backup.");
  if (!validProject(value.project)) throw new Error("That backup has missing, invalid, or oversized project data. No projects were changed.");
  return cleanProject(value.project);
}
// Imports and duplicates always receive fresh identities, including every version.
export function copyProject(project: Project, title = project.title): Project {
  const clean = cleanProject(project);
  return { ...clean, id: crypto.randomUUID(), title: title.slice(0, 70), versions: clean.versions.map(v => ({ ...v, id: crypto.randomUUID() })) };
}

export class ProjectStorageConflictError extends Error {
  constructor() { super("Another tab changed the saved shelf."); this.name = "ProjectStorageConflictError"; }
}
/** Optimistic baseline check: a stale tab never replaces a newer saved shelf. */
export function persistProjects(storage: Pick<Storage, "getItem" | "setItem">, key: string, baseline: string | null, projects: Project[]): string {
  if (storage.getItem(key) !== baseline) throw new ProjectStorageConflictError();
  const serialized = JSON.stringify(projects);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new ProjectStorageConflictError();
  return serialized;
}
