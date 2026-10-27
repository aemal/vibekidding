import { authorize, failure } from "@/lib/v2/http";
import { projectDetail } from "@/lib/v2/store";
import { loadOwnedProject } from "@/lib/v2/jobs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const auth=await authorize(request);if(auth.response)return auth.response;try{const {id}=await params;if(!await loadOwnedProject(id,auth.session!.userId))return Response.json({error:"Project not found."},{status:404});return Response.json(await projectDetail(id,auth.session!.userId));}catch(error){return failure(error);}}
