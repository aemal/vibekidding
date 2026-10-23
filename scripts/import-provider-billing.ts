import { open } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { parseBillingImport } from "../src/lib/studio/billing-import";
import { confirmBillingImport } from "../src/lib/studio/billing-confirmation";
import { schemaReady } from "../src/lib/studio/schema-status";
async function main() {
 const [file,actor,mode,...extra]=process.argv.slice(2);
 if(!file||!actor||extra.length || (mode!==undefined&&mode!=="--apply-reviewed"))
  throw Error("Usage: npm run billing:import -- file.json administrator-uuid [--apply-reviewed]");
 const handle=await open(file,"r");let raw:string;
 try {
  const buffer=Buffer.alloc(100001);
  let bytesRead=0;
  while(bytesRead<buffer.length){
   const chunk=await handle.read(buffer,bytesRead,buffer.length-bytesRead,bytesRead);
   if(!chunk.bytesRead)break;bytesRead+=chunk.bytesRead;
  }
  if(bytesRead>100000)throw Error("Import exceeds 100 KB");
  raw=new TextDecoder("utf-8",{fatal:true}).decode(buffer.subarray(0,bytesRead));
 } finally {await handle.close();}
 const {rows,digest}=parseBillingImport(raw);
 loadEnvConfig(process.cwd(),true,{info(){},error(){}});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error("Supabase configuration missing; no import sent");
 if(!(process.env.STUDIO_ADMIN_USER_IDS||"").split(",").map(x=>x.trim()).includes(actor))throw Error("Actor must be a configured administrator");
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const schema=await db.rpc("studio_schema_status").abortSignal(AbortSignal.timeout(10000));
 if(schema.error||!schemaReady(schema.data))throw Error("Database schema preflight failed");
 const apply=mode==="--apply-reviewed";
 const result=await confirmBillingImport(signal=>db.rpc("studio_billing_import",{p_actor:actor,p_digest:digest,p_rows:rows,p_apply:apply}).abortSignal(signal),apply,rows.length);
 console.log(JSON.stringify({sourceSha256:digest,result}));
 console.log(apply?"Reviewed import confirmed. This does not independently authenticate provider evidence.":"Preview only. Verify source records and amounts before using --apply-reviewed. No credits changed.");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Import failed");process.exitCode=1;});
