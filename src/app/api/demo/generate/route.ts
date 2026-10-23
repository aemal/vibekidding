import { createDemoHandlers } from "@/lib/demo-server/handler";
import { sharedDemoUsage } from "@/lib/demo-server/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createDemoHandlers({ usage: sharedDemoUsage() });
export const GET = handlers.GET;
export const POST = handlers.POST;
