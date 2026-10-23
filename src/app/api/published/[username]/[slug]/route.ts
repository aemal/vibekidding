import { database } from "@/lib/studio/server";
import { readPublishedProject } from "@/lib/studio/published-project";
import { publicationDigest } from "@/lib/studio/publication-digest";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await context.params;
  const project = await readPublishedProject(username, slug,
    process.env.STUDIO_CHILD_SAFETY_APPROVED === "true",
    (name, args, signal) => database().rpc(name, args).abortSignal(signal));
  return Response.json(project ? { digest: publicationDigest(project) } : { error: "Project unavailable" }, {
    status: project ? 200 : 404,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
