export const requiredSchemaRevision = 29;
export function schemaReady(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  return status.revision === requiredSchemaRevision && status.ready === true;
}
