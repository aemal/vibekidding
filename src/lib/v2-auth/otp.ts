import { createHash,randomBytes,randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { submitMail } from '../studio/mail-provider';
import type { StudioUser } from './session';
const TTL=10*60*1000;
function database(){const root=path.resolve(process.env.VIBEKIDDING_V2_DATA_DIR||'.vibekidding-v2');mkdirSync(root,{recursive:true,mode:0o700});const db=new Database(path.join(root,'accounts.sqlite'));db.pragma('journal_mode = WAL');db.pragma('busy_timeout = 5000');db.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS otp_challenges(email TEXT PRIMARY KEY,id TEXT NOT NULL,digest TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL,delivered INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS otp_requests(email TEXT NOT NULL,created_at INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS otp_request_email_time ON otp_requests(email,created_at);`);db.transaction(()=>{const columns=db.prepare('PRAGMA table_info(accounts)').all() as {name:string}[];if(!columns.some(c=>c.name==='email'))db.exec('ALTER TABLE accounts ADD COLUMN email TEXT');db.exec('CREATE UNIQUE INDEX IF NOT EXISTS accounts_email ON accounts(email)');}).immediate();return db;}
function withOtpDb<T>(work:(db:Database.Database)=>T){const db=database();try{return work(db);}finally{db.close();}}
export function normalizeEmail(value:unknown){if(typeof value!=='string')throw new Error('Enter a valid email address.');const email=value.trim().toLowerCase();if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email address.');return email;}
function invited(email:string){return (process.env.VIBEKIDDING_INVITED_EMAILS||'').split(',').map(value=>value.trim().toLowerCase()).includes(email);}
const digest=(id:string,code:string)=>createHash('sha256').update(id+':'+code).digest('hex');
export async function requestEmailOtp(value:unknown,transport:typeof fetch=fetch){const email=normalizeEmail(value);if(!invited(email))throw new Error('This email is not invited to the studio.');const key=process.env.RESEND_API_KEY,from=process.env.STUDIO_MAIL_FROM;if(!key||!from)throw new Error('Email sign-in is not configured on this server.');const now=Date.now(),id=randomBytes(24).toString('hex'),code=String(randomInt(0,1000000)).padStart(6,'0');
 withOtpDb(db=>db.transaction(()=>{db.prepare('DELETE FROM otp_requests WHERE created_at < ?').run(now-3600000);const recent=db.prepare('SELECT COUNT(*) AS count,MAX(created_at) AS latest FROM otp_requests WHERE email=?').get(email) as {count:number;latest:number|null};if(recent.latest&&now-recent.latest<60000)throw new Error('Wait one minute before requesting another code.');if(recent.count>=5)throw new Error('Too many code requests. Try again in an hour.');db.prepare('INSERT INTO otp_requests VALUES(?,?)').run(email,now);db.prepare('INSERT INTO otp_challenges VALUES(?,?,?,?,0,0) ON CONFLICT(email) DO UPDATE SET id=excluded.id,digest=excluded.digest,expires_at=excluded.expires_at,attempts=0,delivered=0').run(email,id,digest(id,code),now+TTL);}).immediate());
 const sent=await submitMail({from,to:[email],subject:'Your VibeKidding sign-in code',text:`Your sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`},id,key,transport);
 if(sent.error||!sent.providerId){withOtpDb(db=>db.prepare('DELETE FROM otp_challenges WHERE email=? AND id=?').run(email,id));throw new Error('The sign-in email could not be confirmed. Wait one minute and try again.');}
 withOtpDb(db=>db.prepare('UPDATE otp_challenges SET delivered=1 WHERE email=? AND id=?').run(email,id));return {sent:true,expiresInSeconds:600};
}
export function verifyEmailOtp(value:unknown,code:unknown):StudioUser{const email=normalizeEmail(value);if(!invited(email))throw new Error('This email is not invited to the studio.');if(typeof code!=='string'||!/^\d{6}$/.test(code))throw new Error('Enter the six-digit code from your email.');const result=withOtpDb(db=>db.transaction(()=>{const row=db.prepare('SELECT * FROM otp_challenges WHERE email=?').get(email) as {id:string;digest:string;expires_at:number;attempts:number;delivered:number}|undefined;
 if(!row||!row.delivered||row.expires_at<=Date.now()||row.attempts>=5)return null;
 db.prepare('UPDATE otp_challenges SET attempts=attempts+1 WHERE email=?').run(email);
 if(digest(row.id,code)!==row.digest)return null;
 db.prepare('DELETE FROM otp_challenges WHERE email=?').run(email);
 const account=db.prepare('SELECT id AS userId,username FROM accounts WHERE email=?').get(email) as StudioUser|undefined;if(account)return account;
 const id=randomBytes(16).toString('hex');const username=(email.split('@')[0].replace(/[^a-z0-9_-]/g,'').slice(0,20)||'member')+'-'+id.slice(0,6);
 // OTP-only accounts receive an unknowable random password hash and remain separate from password accounts.
 db.prepare('INSERT INTO accounts(id,username,salt,password_hash,created_at,email) VALUES(?,?,?,?,?,?)').run(id,username,randomBytes(16).toString('hex'),randomBytes(64).toString('hex'),Date.now(),email);return {userId:id,username};
 }).immediate());if(!result)throw new Error('The code is invalid or expired. Request a new code.');return result;}
