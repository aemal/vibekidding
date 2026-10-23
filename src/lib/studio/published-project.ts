import {schemaReady} from "./schema-status";
export type PublishedProject = {title:string;html:string};
type Read = (name:"studio_schema_status"|"studio_published", args:Record<string,string>, signal:AbortSignal) => PromiseLike<{data:unknown;error:unknown}>;
// No caching: every page request must check the current schema and publication state.
export async function readPublishedProject(
  username:string, slug:string, enabled:boolean, read:Read, timeoutMs=10000,
):Promise<PublishedProject|null> {
  if (!enabled || !/^[a-z][a-z0-9-]{2,23}$/.test(username) || !/^[a-z][a-z0-9-]{2,39}$/.test(slug)) return null;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>10000) return null;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const expired=new Promise<null>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeoutMs);});
  const work=async():Promise<PublishedProject|null>=>{
    const schema=await read("studio_schema_status",{},controller.signal);
    if(controller.signal.aborted || schema.error || !schemaReady(schema.data)) return null;
    const result=await read("studio_published",{p_username:username,p_slug:slug},controller.signal);
    if(controller.signal.aborted || result.error || !Array.isArray(result.data) || result.data.length!==1) return null;
    const project=result.data[0];
    if(!project || typeof project!=="object" || typeof project.title!=="string" || project.title.length>200 ||
       typeof project.html!=="string" || !project.html.trim() || project.html.length>100000) return null;
    return {title:project.title,html:project.html};
  };
  try {return await Promise.race([work().catch(()=>null),expired]);}
  finally {if(timer) clearTimeout(timer);controller.abort();}
}
