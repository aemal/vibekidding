import { authorize, requestJson, failure } from '@/lib/v2/http';
import { providerName } from '@/lib/v2-providers/store';
import { discoverModels } from '@/lib/v2-providers/client';
export const runtime='nodejs';
export async function POST(request:Request){const auth=await authorize(request,true);if(auth.response)return auth.response;try{const input=await requestJson(request,1000);return Response.json(await discoverModels(auth.session.userId,providerName(input.provider)));}catch(error){return failure(error);}}
