import { createAppAiHandlers } from '@/lib/demo-server/app-ai-handler';
import { sharedDemoUsage } from '@/lib/demo-server/usage';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handlers=createAppAiHandlers({usage:sharedDemoUsage()});
export const GET=handlers.GET;
export const POST=handlers.POST;
