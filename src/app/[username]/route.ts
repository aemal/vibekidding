import { findPublishedProject } from "@/lib/v2/store";
import { publishedProjectUrl } from "@/lib/v2/published-url";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{username:string}>}){
  const hostname=(request.headers.get("host") || new URL(request.url).host).split(":")[0].toLowerCase();
  const base=(process.env.BASE_DOMAIN || "localhost").toLowerCase();
  if(!hostname.endsWith("."+base))return new Response("Application not found.",{status:404});
  const username=hostname.slice(0,-base.length-1);const {username:appSlug}=await params;
  const project=await findPublishedProject(username,appSlug);
  if(!project)return new Response("Application not found or not deployed yet.",{status:404});
  try{return new Response(null,{status:307,headers:{location:publishedProjectUrl(project,request.url)}});}catch{return new Response("Application runtime is not configured.",{status:503});}
}
