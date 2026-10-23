import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";

const derive = promisify(scrypt);
export const SESSION_COOKIE = "vk_studio_session";
const LIFETIME_SECONDS = 30 * 24 * 60 * 60;
export type StudioUser = { userId: string; username: string };

function database() {
  const root = path.resolve(process.env.VIBEKIDDING_V2_DATA_DIR || ".vibekidding-v2");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const db = new Database(path.join(root, "accounts.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
  );`);
  return db;
}

function withDb<T>(operation: (db: Database.Database) => T): T {
  const db = database();
  try { return operation(db); } finally { db.close(); }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function needsSetup() {
  return withDb(db => (db.prepare("SELECT count(*) AS count FROM accounts").get() as { count: number }).count === 0);
}

export async function setupAccount(username: string, password: string): Promise<StudioUser> {
  username = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) throw new Error("Use 3–32 letters, numbers, underscores or hyphens for your username.");
  if (password.length < 8 || password.length > 256) throw new Error("Use a password between 8 and 256 characters.");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await derive(password, salt, 64) as Buffer).toString("hex");
  const user = { userId: randomBytes(16).toString("hex"), username };
  withDb(db => db.transaction(() => {
    const count = (db.prepare("SELECT count(*) AS count FROM accounts").get() as { count: number }).count;
    if (count) throw new Error("This studio already has an account. Sign in instead.");
    db.prepare("INSERT INTO accounts(id,username,salt,password_hash,created_at) VALUES (?, ?, ?, ?, ?)").run(user.userId, username, salt, passwordHash, Date.now());
  }).immediate());
  return user;
}

export async function checkPassword(username: string, password: string): Promise<StudioUser | null> {
  if (password.length > 256) return null;
  const account = withDb(db => db.prepare("SELECT * FROM accounts WHERE username = ?").get(username.trim().toLowerCase())) as
    { id: string; username: string; salt: string; password_hash: string } | undefined;
  const candidate = await derive(password, account?.salt || "unknown-account", 64) as Buffer;
  if (!account || !timingSafeEqual(candidate, Buffer.from(account.password_hash, "hex"))) return null;
  return { userId: account.id, username: account.username };
}

export function newSession(user: StudioUser) {
  const token = randomBytes(32).toString("hex");
  withDb(db => {
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(hashToken(token), user.userId, Date.now() + LIFETIME_SECONDS * 1000);
  });
  return token;
}

function requestToken(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export async function requireV2Session(request: Request): Promise<StudioUser | null> {
  const token = requestToken(request);
  if (!token) return null;
  const user = withDb(db => db.prepare(`SELECT accounts.id AS userId, accounts.username FROM sessions
    JOIN accounts ON accounts.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?`).get(hashToken(token), Date.now()));
  return (user as StudioUser | undefined) || null;
}

export function endSession(request: Request) {
  const token = requestToken(request);
  if (token) withDb(db => db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token)));
}

export function sessionCookie(request: Request, token: string, clear = false) {
  const secure = process.env.VIBEKIDDING_PUBLIC_SCHEME === "https" || new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : LIFETIME_SECONDS}${secure ? "; Secure" : ""}`;
}

export function sameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try { return new URL(origin).host === (request.headers.get("host") || new URL(request.url).host); }
  catch { return false; }
}
