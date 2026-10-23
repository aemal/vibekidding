import { authorize, failure, promptFrom, requestJson } from "@/lib/v2/http";
import { enqueueProjectJob, loadOwnedProject } from "@/lib/v2/jobs";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const auth=await authorize(request,true);if(auth.response)return auth.response;try{const {id}=await params;const project=await loadOwnedProject(id,auth.session!.userId);if(!project)return Response.json({error:"Project not found."},{status:404});const prompt=promptFrom(await requestJson(request,20000));const job=await enqueueProjectJob(project,project.currentVersionId?"revise":"generate",prompt);return Response.json({project,job},{status:202});}catch(error){return failure(error);}}
