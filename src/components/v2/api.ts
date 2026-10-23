export type {
  Project as StudioProject,
  SourceFile as StudioFile,
  Version as StudioVersion,
  Job as StudioJob,
  ProjectMessage as StudioMessage,
  ProjectDetail,
} from "@/lib/v2/types";
export type StudioSession = {
  user: { userId: string; username: string } | null;
  setupRequired: boolean;
};
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : body.error?.message ||
          body.message ||
          `Request failed (${response.status}). Please try again.`,
    );
  return body as T;
}
