import { randomUUID } from "node:crypto";
import { appendMessage, getJob, getProject, readVersionFiles, saveJob, saveProject, saveVersion, sourcePath, projectSlug } from "./store";
import { generateProject } from "./provider";
import { environmentMetadata } from "../v2-env/store";
import type { Job, Project } from "./types";

type RuntimeState = { active: Set<string>; chain: Promise<void> };
const globalState = globalThis as typeof globalThis & { __vibeV2Jobs?: RuntimeState };
const state = globalState.__vibeV2Jobs ||= { active:new Set<string>(), chain:Promise.resolve() };
export function isProjectBusy(id:string) { return state.active.has(id); }
export async function recoverInterrupted(project:Project) {
  if ((project.status!=="generating" && project.status!=="building") || state.active.has(project.id)) return;
  state.active.add(project.id);
  try {
    const current=await getProject(project.id,project.ownerId);if(!current)return;
    Object.assign(project,current);
    const job=await getJob(project.id);
    if(!job || (!job.deploymentId && job.status!=="queued" && job.status!=="running"))return;
    if(job.deploymentId){
      let result;
      try{result=await controllerRequest("/deployments/"+encodeURIComponent(job.deploymentId));}
      catch{project.status="building";project.error="The studio restarted. Deployment status is temporarily unavailable; waiting to reconnect to the build controller.";await saveProject(project);return;}
      if(result.projectId && result.projectId!==project.id)throw new Error("Deployment belongs to a different project.");
      const logs=typeof result.logs==="string"?result.logs.split("\n"):Array.isArray(result.logs)?result.logs:[];
      if(logs.length)job.logs=[...job.logs.filter(line=>!line.startsWith("[build] ")),...logs.map((line:unknown)=>"[build] "+String(line)).slice(-150)];
      if(result.status==="ready" || result.status==="completed"){
        const versionId=job.sourceVersionId || result.versionId;
        if(typeof versionId!=="string")throw new Error("Deployment finished, but its source version could not be verified.");
        if(result.versionId && result.versionId!==versionId)throw new Error("Deployment source version does not match the saved job.");
        await readVersionFiles(project.id,versionId);
        project.deployedVersionId=versionId;project.previewUrl=typeof result.url==="string"?result.url:`/apps/${project.id}/`;project.status="ready";delete project.error;job.status="completed";delete job.error;
        job.logs.push("Recovered the completed deployment after studio restart.");
      }else if(result.status==="failed" || result.status==="error"){
        job.status="failed";job.error=typeof result.error==="string"?result.error:"The controller reported that the deployment failed.";project.status="error";project.error=job.error;
      }else{project.status="building";delete project.error;job.status="running";delete job.error;}
      await saveJob(job);await saveProject(project);return;
    }
    job.status="failed";job.error="The studio restarted before this job finished. Your saved source and previous deployment are preserved. Retry generation or deploy the saved version.";
    await saveJob(job);project.status="error";project.error=job.error;await saveProject(project);
  }catch(error){project.status="error";project.error=error instanceof Error?error.message:"Deployment recovery failed.";const job=await getJob(project.id);if(job){job.status="failed";job.error=project.error;await saveJob(job);}await saveProject(project);}
  finally{state.active.delete(project.id);}
}
function controllerBase() { return (process.env.VIBEKIDDING_CONTROLLER_URL || "http://127.0.0.1:4000").replace(/\/$/,""); }
function controllerHeaders() { const headers:Record<string,string>={"content-type":"application/json"};if(process.env.VIBEKIDDING_CONTROLLER_TOKEN)headers.authorization=`Bearer ${process.env.VIBEKIDDING_CONTROLLER_TOKEN}`;return headers; }
async function controllerRequest(route:string, body?:unknown) {
  let response:Response;
  try { response=await fetch(controllerBase()+route,{method:body?"POST":"GET",headers:controllerHeaders(),body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),cache:"no-store"}); }
  catch {throw new Error("The application build controller is unavailable. Start the Docker Compose stack, then deploy this saved version.");}
  const data=await response.json();if(!response.ok)throw new Error(typeof data.error==="string"?data.error:`Build controller returned HTTP ${response.status}.`);return data;
}
async function deploy(project:Project,job:Job,versionId:string) {
  job.sourceVersionId=versionId;await saveJob(job);
  project.status="building";await saveProject(project);
  job.logs.push("Source saved. Queuing npm build and deployment.");await saveJob(job);
  const started=await controllerRequest("/deploy",{projectId:project.id,versionId,sourcePath:sourcePath(project.id,versionId)});
  if(typeof started.deploymentId!=="string")throw new Error("Build controller did not return a deployment identifier.");
  job.deploymentId=started.deploymentId;await saveJob(job);
  const until=Date.now()+12*60*1000;
  while(Date.now()<until){
    const result=await controllerRequest("/deployments/"+encodeURIComponent(job.deploymentId!));
    const buildLogs=typeof result.logs==="string"?result.logs.split("\n"):Array.isArray(result.logs)?result.logs:[];
    if(buildLogs.length)job.logs=[...job.logs.filter(line=>!line.startsWith("[build] ")),...buildLogs.map((line:unknown)=>"[build] "+String(line)).slice(-150)];
    await saveJob(job);
    if(result.status==="failed" || result.status==="error")throw new Error(typeof result.error==="string"?result.error:"Application build failed. Inspect the build log and revise the source.");
    if(result.status==="completed" || result.status==="ready"){
      project.deployedVersionId=versionId;project.previewUrl=typeof result.url==="string"?result.url:`/apps/${project.id}/`;project.status="ready";delete project.error;await saveProject(project);
      job.logs.push("Application is running. Persistent app data is retained across deployments.");return;
    }
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw new Error("Build did not complete within 12 minutes. Check the controller before retrying.");
}
export async function enqueueProjectJob(project:Project,type:Job["type"],prompt="",versionId?:string):Promise<Job>{
  if(state.active.has(project.id))throw new Error("This project already has work in progress.");
  state.active.add(project.id);
  try{const pending=await getJob(project.id);if(pending && (pending.status==="queued"||pending.status==="running"))throw new Error("Wait for the existing deployment to finish or reconnect to its controller.");}catch(error){state.active.delete(project.id);throw error;}
  const job:Job={id:randomUUID(),projectId:project.id,type,status:"queued",logs:["Queued for the development worker."],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  try{
    project.status=type==="deploy"?"building":"generating";delete project.error;await saveProject(project);await saveJob(job);
    if(prompt)await appendMessage(project.id,"user",prompt);
  }catch(error){state.active.delete(project.id);throw error;}
  const work=async()=>{
    try{
      job.status="running";await saveJob(job);
      let target=versionId || project.currentVersionId;
      if(type!=="deploy"){
        job.logs.push("Generating real source files with your selected provider and model.");await saveJob(job);
        const existing=project.currentVersionId?await readVersionFiles(project.id,project.currentVersionId):undefined;
        const configured=(await environmentMetadata(project.id)).variables.filter(variable=>variable.configured).map(variable=>variable.name);
        const generated=await generateProject(prompt,existing,fetch,configured,project.ownerId);
        project.name=generated.name;project.description=generated.description;
        if(!project.currentVersionId)project.slug=projectSlug(generated.name,project.id);
        const version=await saveVersion(project,prompt,generated.files);target=version.id;
        job.logs.push(`Saved ${version.fileCount} source files as a new version.`);await saveJob(job);
        await appendMessage(project.id,"assistant",generated.summary);
      }
      if(!target)throw new Error("Create or save source files before deploying.");
      await deploy(project,job,target);
      job.status="completed";await saveJob(job);
    }catch(error){
      const message=error instanceof Error?error.message:"Project operation failed.";
      project.status="error";project.error=message;job.status="failed";job.error=message;job.logs.push(message);
      await saveProject(project);await saveJob(job);await appendMessage(project.id,"assistant",message);
    }finally{state.active.delete(project.id);}
  };
  // The self-hosted Next server is long-lived. Work is serialized to avoid simultaneous resource-heavy builds.
  state.chain=state.chain.then(work,work).catch(error=>{console.error("V2 job persistence failed",error instanceof Error?error.message:"unknown");state.active.delete(project.id);});
  return job;
}
export async function loadOwnedProject(id:string,ownerId:string){const project=await getProject(id,ownerId);if(project)await recoverInterrupted(project);return project;}

export async function withProjectEdit<T>(id:string,work:()=>Promise<T>):Promise<T>{
 if(state.active.has(id))throw new Error("Wait for the current project operation before editing files.");
 state.active.add(id);try{const pending=await getJob(id);if(pending && (pending.status==="queued"||pending.status==="running"))throw new Error("Wait for the existing deployment to finish before editing.");return await work();}finally{state.active.delete(id);}
}
