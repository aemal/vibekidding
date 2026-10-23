import { authorize, failure, requestJson } from "@/lib/v2/http";
import { getProject } from "@/lib/v2/store";
import { withProjectEdit } from "@/lib/v2/jobs";
import { environmentMetadata, updateEnvironment } from "@/lib/v2-env/store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await authorize(request);if(auth.response)return auth.response;
 try{const {id}=await params;if(!await getProject(id,auth.session!.userId))return Response.json({error:"Project not found."},{status:404});return Response.json(await environmentMetadata(id));}catch(error){return failure(error);}
}
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await authorize(request,true);if(auth.response)return auth.response;
 try{const {id}=await params;if(!await getProject(id,auth.session!.userId))return Response.json({error:"Project not found."},{status:404});const input=await requestJson(request,900000);return await withProjectEdit(id,async()=>Response.json(await updateEnvironment(id,input)));}catch(error){return failure(error);}
}
