import { authorize, requestJson, failure } from '@/lib/v2/http';
import { providerMetadata, updateProvider } from '@/lib/v2-providers/store';
export const runtime='nodejs';
export async function GET(request:Request){const auth=await authorize(request);if(auth.response)return auth.response;try{return Response.json(await providerMetadata(auth.session.userId),{headers:{'cache-control':'no-store'}});}catch(error){return failure(error);}}
export async function PUT(request:Request){const auth=await authorize(request,true);if(auth.response)return auth.response;try{return Response.json(await updateProvider(auth.session.userId,await requestJson(request,12000)));}catch(error){return failure(error);}}
