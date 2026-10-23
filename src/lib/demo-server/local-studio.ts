import { demoAccessError, type DemoEnvironment } from "./access";

// Use the working local workshop at the normal studio URL. This selects UI only;
// it grants no account/admin permissions and does not change protected API routes.
export function localStudioEnabled(headers: Headers, env: DemoEnvironment): boolean {
  if (env.NODE_ENV !== "development" || env.VIBEKIDDING_DEMO_ENABLED !== "1" ||
      env.VIBEKIDDING_PUBLIC_TEMPLATE_DEMO === "1") return false;
  const host = headers.get("host");
  if (!host) return false;
  const protocol = headers.get("x-forwarded-proto") || "http";
  // A user-followed document link only chooses the local UI. Fetches, embedded
  // documents and form submissions retain the normal cross-site rejection.
  // Clone rather than mutate the request headers; API access checks stay strict.
  const entryHeaders = new Headers(headers);
  if (["cross-site", "same-site"].includes(headers.get("sec-fetch-site") || "") &&
      headers.get("sec-fetch-mode") === "navigate" &&
      headers.get("sec-fetch-dest") === "document" &&
      headers.get("sec-fetch-user") === "?1" && !headers.has("origin")) {
    entryHeaders.delete("sec-fetch-site");
  }
  try {
    return !demoAccessError(new Request(`${protocol}://${host}/`, { headers: entryHeaders }), env);
  } catch {
    return false;
  }
}
