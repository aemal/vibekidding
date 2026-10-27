import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Job, Project, ProjectDetail, ProjectMessage, SourceFile, Version } from "./types";

export const MAX_SOURCE_BYTES = 1_000_000;
export const MAX_FILES = 80;
export function dataRoot() { return path.resolve(process.env.VIBEKIDDING_V2_DATA_DIR || ".vibekidding-v2"); }
export function assertId(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid project or version identifier.");
  return id;
}
export function projectPath(id: string) { return path.join(dataRoot(), "projects", assertId(id)); }
export function sourcePath(id: string, versionId: string) { return path.join(projectPath(id), "versions", assertId(versionId), "source"); }
export function validateFiles(input: unknown): SourceFile[] {
  if (!Array.isArray(input) || !input.length || input.length > MAX_FILES) throw new Error(`Provide between 1 and ${MAX_FILES} source files.`);
  const seen = new Set<string>(); let bytes = 0;
  const files = input.map(file => {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") throw new Error("Each source file requires a path and text content.");
    const name = file.path;
    if (name.length > 200 || !/^[a-zA-Z0-9_./@+()[\]-]+$/.test(name) || name.startsWith("/") || name.split("/").some((part: string) => !part || part === "." || part === "..") || /(^|\/)(node_modules|\.git|\.env(?:\..*)?|data|uploads)(\/|$)/.test(name)) throw new Error(`Unsupported source path: ${name}`);
    if (seen.has(name)) throw new Error(`Duplicate source file: ${name}`);
    seen.add(name); bytes += Buffer.byteLength(file.content);
    return { path: name, content: file.content };
  });
  if (bytes > MAX_SOURCE_BYTES) throw new Error("Project source exceeds the 1 MB limit.");
  const pkg = files.find(file => file.path === "package.json");
  if (!pkg) throw new Error("The project must contain package.json.");
  let parsed; try { parsed = JSON.parse(pkg.content); } catch { throw new Error("package.json must contain valid JSON."); }
  if (typeof parsed.scripts?.build !== "string" || typeof parsed.scripts?.start !== "string") throw new Error("package.json needs build and start scripts.");
  return files;
}
async function atomicJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}
async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function getProject(id: string, ownerId: string): Promise<Project | null> {
  const project = await readJson<Project>(path.join(projectPath(id), "project.json"));
  return project?.ownerId === ownerId ? project : null;
}
export async function listProjects(ownerId: string): Promise<Project[]> {
  let entries; try { entries = await fs.readdir(path.join(dataRoot(), "projects"), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const projects = await Promise.all(entries.filter(e => e.isDirectory() && /^[a-zA-Z0-9_-]{1,80}$/.test(e.name)).map(e => getProject(e.name, ownerId)));
  return projects.filter((p): p is Project => !!p).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function createProject(ownerId: string, name: string, prompt: string, ownerUsername?:string): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = { id: randomUUID(), ownerId, ownerUsername, name: name.slice(0,100) || "New application", description: prompt.slice(0,500), createdAt: now, updatedAt: now, status: "idle" };
  project.slug = "app-"+project.id.slice(0,8);
  await saveProject(project); await atomicJson(path.join(projectPath(project.id), "messages.json"), []);
  return project;
}
export async function saveProject(project: Project) {
  project.updatedAt = new Date().toISOString();
  await atomicJson(path.join(projectPath(project.id), "project.json"), project);
}
export async function readVersionFiles(id: string, versionId: string): Promise<SourceFile[]> {
  const manifest = await readJson<{files: string[]}>(path.join(projectPath(id), "versions", assertId(versionId), "manifest.json"));
  if (!manifest) throw new Error("Project version not found.");
  return Promise.all(manifest.files.map(async name => ({ path: name, content: await fs.readFile(path.join(sourcePath(id,versionId),name), "utf8") })));
}
export async function saveVersion(project: Project, prompt: string, input: SourceFile[]): Promise<Version> {
  const files = validateFiles(input); const id = randomUUID();
  const version: Version = { id, prompt: prompt.slice(0,8000), createdAt: new Date().toISOString(), fileCount: files.length };
  const root = sourcePath(project.id,id);
  for (const file of files) { const dest = path.join(root,file.path); await fs.mkdir(path.dirname(dest),{recursive:true}); await fs.writeFile(dest,file.content); }
  await atomicJson(path.join(root,"..","manifest.json"), { ...version, files: files.map(f=>f.path) });
  project.currentVersionId = id; await saveProject(project); return version;
}
export async function saveJob(job: Job) { job.updatedAt = new Date().toISOString(); await atomicJson(path.join(projectPath(job.projectId),"job.json"), job); }
export async function getJob(id: string) { return readJson<Job>(path.join(projectPath(id),"job.json")); }
export async function appendMessage(id: string, role: ProjectMessage["role"], content: string) {
  const file = path.join(projectPath(id), "messages.json"); const messages = await readJson<ProjectMessage[]>(file) || [];
  messages.push({role, content:content.slice(0,12000), createdAt:new Date().toISOString()}); await atomicJson(file,messages.slice(-100));
}
export async function projectDetail(id: string, ownerId: string): Promise<ProjectDetail | null> {
  const project = await getProject(id,ownerId); if (!project) return null;
  let entries: string[]; try { entries = await fs.readdir(path.join(projectPath(id),"versions")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; entries=[]; }
  const manifests = await Promise.all(entries.filter(e=>/^[a-zA-Z0-9_-]{1,80}$/.test(e)).map(e=>readJson<Version>(path.join(projectPath(id),"versions",e,"manifest.json"))));
  const versions = manifests.filter((v):v is Version=>!!v).map(({id,createdAt,prompt,fileCount})=>({id,createdAt,prompt,fileCount})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return { project, versions, files: project.currentVersionId ? await readVersionFiles(id,project.currentVersionId) : [], job: await getJob(id), messages: await readJson<ProjectMessage[]>(path.join(projectPath(id),"messages.json")) || [] };
}

export function projectSlug(name:string,id:string) {return (name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50) || "app")+"-"+id.slice(0,6);}
export async function findPublishedProject(ownerUsername:string,slug:string):Promise<Project|null>{
  if(!/^[a-z0-9_-]{1,64}$/i.test(ownerUsername) || !/^[a-z0-9_-]{1,80}$/i.test(slug))return null;
  let dirs;try{dirs=await fs.readdir(path.join(dataRoot(),"projects"),{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}
  for(const dir of dirs){if(!dir.isDirectory() || !/^[a-zA-Z0-9_-]{1,80}$/.test(dir.name))continue;const project=await readJson<Project>(path.join(projectPath(dir.name),"project.json"));if(project?.ownerUsername?.toLowerCase()===ownerUsername.toLowerCase() && project.slug===slug && project.deployedVersionId && project.previewUrl)return project;}
  return null;
}
