import { requireV2Session, sameOriginMutation } from "@/lib/v2-auth/session";
export async function authorize(request:Request,mutation=false){
  if((mutation || request.headers.has("origin") || request.headers.get("sec-fetch-site")==="cross-site") && !sameOriginMutation(request))return {response:Response.json({error:"Request origin does not match the studio."},{status:403})};
  const session=await requireV2Session(request);
  if(!session)return {response:Response.json({error:"Sign in to the studio."},{status:401})};
  return {session};
}
export async function requestJson(request:Request,max=1_200_000):Promise<Record<string,unknown>>{
  if(!request.headers.get("content-type")?.includes("application/json"))throw new Error("Send an application/json request.");
  const reader=request.body?.getReader();let text="";let bytes=0;const decoder=new TextDecoder();
  if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max){await reader.cancel();throw new Error("Request is too large.");}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}}
  let data;try{data=JSON.parse(text);}catch{throw new Error("Request must contain valid JSON.");}
  if(!data || typeof data!=="object" || Array.isArray(data))throw new Error("Request must be a JSON object.");return data;
}
export function promptFrom(data:Record<string,unknown>){if(typeof data.prompt!=="string" || !data.prompt.trim() || data.prompt.length>8000)throw new Error("Describe the application in 1–8000 characters.");return data.prompt.trim();}
export function failure(error:unknown){return Response.json({error:error instanceof Error?error.message:"Project request failed."},{status:400});}
