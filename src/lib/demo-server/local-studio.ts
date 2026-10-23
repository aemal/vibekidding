import { demoAccessError, type DemoEnvironment } from "./access";

// Use the working local workshop at the normal studio URL. This selects UI only;
// it grants no account/admin permissions and does not change protected API routes.
export function localStudioEnabled(headers: Headers, env: DemoEnvironment): boolean {
  if (env.NODE_ENV !== "development" || env.VIBEKIDDING_DEMO_ENABLED !== "1" ||
      env.VIBEKIDDING_PUBLIC_TEMPLATE_DEMO === "1") return false;
  const host = headers.get("host");
  if (!host) return false;
  const protocol = headers.get("x-forwarded-proto") || "http";
  try {
    return !demoAccessError(new Request(`${protocol}://${host}/`, { headers }), env);
  } catch {
    return false;
  }
}
