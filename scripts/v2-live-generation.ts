import { loadEnvConfig } from "@next/env";
import { generateProject, V2_MODEL } from "../src/lib/v2/provider";
import { createProject, saveVersion, sourcePath } from "../src/lib/v2/store";
loadEnvConfig(process.cwd());
async function main(){
  const project=await createProject("v2-live-verification","Task tracker verification","A task tracker with optional photo attachments","verification");
  const result=await generateProject("Build a polished responsive task tracker for a household or small team, not a game. Users can create a task with title, optional description and optional uploaded photo; see all tasks; mark a task complete; filter all/open/completed; and delete a task. Persist tasks and photo references using the provided real SQLite-backed records and upload API. Show pending, saved and error states accurately. Use a clean teal interface. Keep existing server.mjs and src/api.js unless genuinely necessary to change. No authentication needed inside this generated app.");
  project.name=result.name;project.description=result.description;
  const version=await saveVersion(project,"Live provider acceptance: persistent tasks and uploads",result.files);
  console.log(JSON.stringify({model:V2_MODEL,projectId:project.id,versionId:version.id,sourcePath:sourcePath(project.id,version.id),files:result.files.map(f=>f.path),summary:result.summary},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Generation failed");process.exitCode=1;});
