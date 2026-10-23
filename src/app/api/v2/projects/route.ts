import { authorize, failure, promptFrom, requestJson } from "@/lib/v2/http";
import { createProject, listProjects } from "@/lib/v2/store";
import { enqueueProjectJob, recoverInterrupted } from "@/lib/v2/jobs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){const auth=await authorize(request);if(auth.response)return auth.response;try{const projects=await listProjects(auth.session!.userId);await Promise.all(projects.map(recoverInterrupted));return Response.json({projects});}catch(error){return failure(error);}}
export async function POST(request:Request){const auth=await authorize(request,true);if(auth.response)return auth.response;try{const data=await requestJson(request,20000);const prompt=promptFrom(data);const project=await createProject(auth.session!.userId,typeof data.name==="string"?data.name:"New application",prompt,auth.session!.username);const job=await enqueueProjectJob(project,"generate",prompt);return Response.json({project,job},{status:202});}catch(error){return failure(error);}}
