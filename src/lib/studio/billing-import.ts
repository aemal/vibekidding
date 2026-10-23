import { createHash } from "node:crypto";
export function parseBillingImport(raw: string) {
  if (Buffer.byteLength(raw)>100000) throw new Error("Import exceeds 100 KB");
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length<1 || rows.length>100) throw new Error("Expected 1 to 100 records");
  const usages=new Set(), requests=new Set();
  for (const row of rows) {
    if (!row || typeof row!=="object" || Object.keys(row).sort().join(",")!=="chargeMicroUsd,provider,requestId,usageId"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.usageId)
      || !["openai","elevenlabs","typesafe"].includes(row.provider)
      || typeof row.requestId!=="string" || !/^[A-Za-z0-9_.:-]{3,200}$/.test(row.requestId)
      || !Number.isSafeInteger(row.chargeMicroUsd) || row.chargeMicroUsd<0 || row.chargeMicroUsd>1000000)
      throw new Error("Invalid normalized record");
    const request=`${row.provider}:${row.requestId}`;
    if(usages.has(row.usageId)||requests.has(request)) throw new Error("Duplicate record");
    usages.add(row.usageId);requests.add(request);
  }
  return {rows, digest:createHash("sha256").update(raw).digest("hex")};
}
