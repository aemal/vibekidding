import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { schemaReady, requiredSchemaRevision } from '../src/lib/studio/schema-status';
async function main() {
 loadEnvConfig(process.cwd(),true,{info(){},error(){}});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url || !key) {console.error('Database check blocked: Supabase URL/service-role configuration missing. No request sent.');process.exitCode=1;return;}
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
 const result=await db.rpc('studio_schema_status');
 if(result.error || !schemaReady(result.data)) {console.error(`Database preflight failed. Apply and review migration chain through revision ${requiredSchemaRevision}; verify safety procedures, triggers and RLS/privileges. No data changed.`);process.exitCode=1;return;}
 console.log(`Database schema preflight passed at revision ${requiredSchemaRevision}. Read-only check; not Auth, provider, realtime, consent or deployment acceptance.`);
}
main().catch(()=>{console.error('Database preflight unavailable. No data changed.');process.exitCode=1;});
