import { DemoUsage } from './access';
/** One exact process-local pool across generation and app AI, including dev reloads. */
export function sharedDemoUsage(): DemoUsage {
 const state=globalThis as typeof globalThis & {vibekiddingDemoUsage?:DemoUsage};
 return state.vibekiddingDemoUsage ??= new DemoUsage();
}
