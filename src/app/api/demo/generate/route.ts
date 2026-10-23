import { createDemoHandlers } from "@/lib/demo-server/handler";
import { DemoUsage } from "@/lib/demo-server/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep usage accounting across dev module reloads, scoped to this local Node process.
const state = globalThis as typeof globalThis & { vibekiddingDemoUsage?: DemoUsage };
state.vibekiddingDemoUsage ??= new DemoUsage();
const handlers = createDemoHandlers({ usage: state.vibekiddingDemoUsage });
export const GET = handlers.GET;
export const POST = handlers.POST;
