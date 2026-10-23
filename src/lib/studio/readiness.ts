export type SetupCheck = { id: string; label: string; status: "missing" | "configured" | "needs-review"; detail: string };
// Values never leave this function. Presence is not provider validation.
export function setupChecks(env: Record<string, string | undefined>): SetupCheck[] {
  const present = (keys: string[]) => keys.every(key => !!env[key]?.trim());
  const check = (id: string, label: string, keys: string[]): SetupCheck => {
    const missing = keys.filter(key => !env[key]?.trim());
    return { id, label, status: missing.length ? "missing" : "configured", detail: missing.length ? `Missing: ${missing.join(", ")}` : "Configured locally; live verification still required." };
  };
  const items: SetupCheck[] = [
    check("supabase", "Supabase accounts and database", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
    check("admin", "Administrator account", ["STUDIO_ADMIN_USER_IDS"]),
    check("openai", "Project generation", ["OPENAI_API_KEY"]),
    check("safety", "TypeSafe safety evaluation", ["TYPESAFE_API_KEY", "TYPESAFE_MODEL", "TYPESAFE_MAX_CHECK_MICRO_USD"]),
    check("mail", "Parent and administrator email", ["RESEND_API_KEY", "STUDIO_MAIL_FROM"]),
    check("webhook", "Email delivery events", ["RESEND_WEBHOOK_SECRET"]),
    check("worker", "Notification scheduler authentication", ["STUDIO_WORKER_SECRET"]),
    check("voice", "ElevenLabs credentials", ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID"]),
  ];
  const worker = items.find(item => item.id === "worker")!;
  if (present(["STUDIO_WORKER_SECRET"]) && env.STUDIO_WORKER_SECRET!.length < 32) {
    worker.status = "needs-review";
    worker.detail = "Worker secret must contain at least 32 random characters.";
  }
  const safety = items.find(item => item.id === "safety")!;
  const cost = Number(env.TYPESAFE_MAX_CHECK_MICRO_USD);
  if (present(["TYPESAFE_MAX_CHECK_MICRO_USD"]) && (!Number.isSafeInteger(cost) || cost <= 0 || cost > 1000000)) {
    safety.status = "needs-review";
    safety.detail = "Safety check cost bound must be an integer from 1 to 1,000,000 micro-USD.";
  }
  items.push({ id: "consent", label: "Child privacy and consent review", status: "needs-review", detail: env.STUDIO_CHILD_SAFETY_APPROVED === "true" ? "Gate enabled; an environment flag is not evidence of reviewed consent or provider eligibility." : "Gate remains closed until documented consent, eligibility and privacy review." });
  items.push({ id: "voice-relay", label: "Live voice launch", status: "needs-review", detail: "Voice remains disabled until the server relay, moderation, cost controls and live acceptance are complete." });
  if (env.STUDIO_PUBLISHED_STORAGE_ENABLED === "true") items.push({ id: "published-storage", label: "Published app storage launch", status: "needs-review", detail: "Backend implemented; isolated execution, authenticated bridge and deployed acceptance must be reviewed before launch." });
  return items;
}
