import { notFound } from "next/navigation";
import { database } from "@/lib/studio/server";
import { PublishedPreview } from "@/components/PublishedPreview";
import { publicationDigest } from "@/lib/studio/publication-digest";
import Link from "next/link";
import {readPublishedProject, type PublishedProject} from "@/lib/studio/published-project";
export const dynamic = "force-dynamic";
export default async function Published({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  let project: PublishedProject | null = null;
  try {
    project = await readPublishedProject(
      username, slug, process.env.STUDIO_CHILD_SAFETY_APPROVED === "true",
      (name, args, signal) => database().rpc(name, args).abortSignal(signal),
    );
  } catch {
    notFound();
  }
  if (!project) notFound();
  return (
    <main style={{ padding: 20, background: "#fafaf8", minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h1>
          {project.title} · by {username}
        </h1>
        <Link href="/">Build your own ↗</Link>
      </header>
      <PublishedPreview key={publicationDigest(project)} username={username} slug={slug}
        digest={publicationDigest(project)} title={project.title} html={project.html} />
    </main>
  );
}
