import { loadEnvConfig } from "@next/env";
import { generateProject, V2_MODEL } from "../src/lib/v2/provider";
import { getProject, readVersionFiles, saveVersion, sourcePath } from "../src/lib/v2/store";
loadEnvConfig(process.cwd());
async function main(){
 const id=process.env.V2_VERIFY_PROJECT_ID;if(!id)throw new Error("Set V2_VERIFY_PROJECT_ID for the verification project.");
 const project=await getProject(id,"v2-live-verification");if(!project?.currentVersionId)throw new Error("Verification project not found.");
 const generated=await generateProject("Revise this existing task tracker: add an optional due date input to the new-task form and show the due date on task cards when present. Change the app heading to Shared Task Studio. Preserve all existing task and photo persistence and keep the same collection name and API. Existing tasks without due dates must still load and work. Do not recreate or clear existing records. Keep all other functionality and visual quality.",await readVersionFiles(id,project.currentVersionId));
 const version=await saveVersion(project,"Add optional due dates, preserving existing data",generated.files);
 console.log(JSON.stringify({model:V2_MODEL,projectId:id,versionId:version.id,sourcePath:sourcePath(id,version.id),summary:generated.summary,files:generated.files.map(f=>f.path)},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Revision failed");process.exitCode=1;});
