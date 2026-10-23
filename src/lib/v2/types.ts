export type SourceFile = { path: string; content: string };
export type ProjectStatus = "idle" | "generating" | "building" | "ready" | "error";
export type Project = {
  id: string; ownerId: string; ownerUsername?: string; slug?: string; name: string; description: string;
  createdAt: string; updatedAt: string; currentVersionId?: string;
  deployedVersionId?: string; previewUrl?: string; status: ProjectStatus; error?: string;
};
export type Version = { id: string; createdAt: string; prompt: string; fileCount: number };
export type ProjectMessage = { role: "user" | "assistant"; content: string; createdAt: string };
export type Job = {
  id: string; projectId: string; type: "generate" | "revise" | "deploy";
  status: "queued" | "running" | "completed" | "failed";
  logs: string[]; createdAt: string; updatedAt: string; error?: string;
  deploymentId?: string; sourceVersionId?: string;
};
export type ProjectDetail = { project: Project; versions: Version[]; files: SourceFile[]; job: Job | null; messages: ProjectMessage[] };
export type GeneratedProject = { name: string; description: string; files: SourceFile[]; summary: string };
