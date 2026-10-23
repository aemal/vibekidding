import { authorize, failure, requestJson } from "@/lib/v2/http";
import { enqueueProjectJob, loadOwnedProject } from "@/lib/v2/jobs";
import { readVersionFiles } from "@/lib/v2/store";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const auth=await authorize(request,true);if(auth.response)return auth.response;try{const {id}=await params;const project=await loadOwnedProject(id,auth.session!.userId);if(!project)return Response.json({error:"Project not found."},{status:404});const data=await requestJson(request,20000);const versionId=typeof data.versionId==="string"?data.versionId:project.currentVersionId;if(!versionId)throw new Error("Save source files before deploying.");await readVersionFiles(id,versionId);const job=await enqueueProjectJob(project,"deploy","",versionId);return Response.json({project,job},{status:202});}catch(error){return failure(error);}}
