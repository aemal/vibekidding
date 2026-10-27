import { sameOriginMutation,newSession,sessionCookie } from '@/lib/v2-auth/session';
import { verifyEmailOtp } from '@/lib/v2-auth/otp';
import { requestJson,failure } from '@/lib/v2/http';
export const runtime='nodejs';
export async function POST(request:Request){if(!sameOriginMutation(request))return Response.json({error:'Invalid request origin.'},{status:403});try{const input=await requestJson(request,2000);const user=verifyEmailOtp(input.email,input.code);return Response.json({user},{headers:{'set-cookie':sessionCookie(request,newSession(user)),'cache-control':'no-store'}});}catch(error){return failure(error);}}
