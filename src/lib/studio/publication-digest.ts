import { createHash } from "node:crypto";
import type { PublishedProject } from "./published-project";
export function publicationDigest(project: PublishedProject) {
  return createHash("sha256").update(JSON.stringify([project.title, project.html])).digest("hex");
}
