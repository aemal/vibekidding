import { authorize, failure } from "@/lib/v2/http";
import { getProject, readVersionFiles } from "@/lib/v2/store";
import { sourceZip } from "@/lib/v2-export/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const project = await getProject(id, auth.session!.userId);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (!project.currentVersionId) return Response.json({ error: "Create a source version before downloading." }, { status: 409 });
    const files = await readVersionFiles(id, project.currentVersionId);
    const filename = (project.slug || project.name).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "project";
    return new Response(new Uint8Array(sourceZip(files)), { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return failure(error); }
}
