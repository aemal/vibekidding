import { sameOriginMutation } from '@/lib/v2-auth/session';
import { requestEmailOtp } from '@/lib/v2-auth/otp';
import { requestJson,failure } from '@/lib/v2/http';
export const runtime='nodejs';
export async function POST(request:Request){if(!sameOriginMutation(request))return Response.json({error:'Invalid request origin.'},{status:403});try{const input=await requestJson(request,2000);return Response.json(await requestEmailOtp(input.email),{headers:{'cache-control':'no-store'}});}catch(error){return failure(error);}}
