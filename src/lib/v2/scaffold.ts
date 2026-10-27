import type { SourceFile } from "./types";

/** Default platform substrate. The generator may extend/replace these files for custom backends. */
export function starterFiles(): SourceFile[] { return [
  { path: "package.json", content: JSON.stringify({ name:"vibe-application",private:true,type:"module",scripts:{build:"vite build",start:"node server.mjs"},dependencies:{react:"^19.2.0","react-dom":"^19.2.0",vite:"^7.1.0"}},null,2) },
  { path:"vite.config.js", content:"import { defineConfig } from 'vite';\nexport default defineConfig({base:process.env.VITE_BASE || '/',build:{outDir:'dist'}});\n" },
  { path:"index.html", content:'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My application</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
  { path:"src/main.jsx", content:"import React from 'react';\nimport {createRoot} from 'react-dom/client';\nimport App from './App.jsx';\nimport './styles.css';\ncreateRoot(document.getElementById('root')).render(<App/>);\n" },
  { path:"src/api.js", content:`const base = import.meta.env.BASE_URL;
export async function request(route, options={}) {
  const response = await fetch(base + 'api/' + route, { ...options, headers:{'content-type':'application/json',...options.headers} });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
export const records = {
  list: collection => request('records/' + encodeURIComponent(collection)),
  save: (collection, data, id) => request('records/' + encodeURIComponent(collection) + (id ? '/' + encodeURIComponent(id) : ''), {method:'PUT',body:JSON.stringify(data)}),
  remove: (collection,id) => request('records/' + encodeURIComponent(collection) + '/' + encodeURIComponent(id),{method:'DELETE'})
};
export async function upload(file) {
  const content = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(reader.result.split(',')[1]); reader.onerror=reject; reader.readAsDataURL(file); });
  return request('uploads',{method:'POST',body:JSON.stringify({name:file.name,type:file.type,content})});
}
` },
  { path:"src/App.jsx", content:"import React from 'react';\nexport default function App(){return <main><h1>Your new application</h1><p>Describe what you would like to build.</p></main>;}\n" },
  { path:"src/styles.css", content:"*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#f5f8f7;color:#162721}main{max-width:960px;margin:auto;padding:32px}button,input,textarea,select{font:inherit}button{cursor:pointer}button:disabled{cursor:wait}img{max-width:100%}\n" },
  { path:"server.mjs", content:SERVER_SOURCE }
]; }

const SERVER_SOURCE = String.raw`import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
const dataDir=process.env.DATA_DIR || './data';
await mkdir(path.join(dataDir,'uploads'),{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'app.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records(collection TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(collection,id)); CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL);');
const base=(process.env.BASE_PATH || '/').replace(/\/$/,'');
const namePattern=/^[a-zA-Z0-9_-]{1,100}$/;
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw new Error('Upload or request is too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString() || '{}');}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{
  let pathname=new URL(req.url,'http://localhost').pathname;
  if(base && pathname.startsWith(base+'/'))pathname=pathname.slice(base.length);
  if(pathname==='/api/health')return json(res,200,{ok:true});
  const match=pathname.match(/^\/api\/records\/([a-zA-Z0-9_-]{1,100})(?:\/([a-zA-Z0-9_-]{1,100}))?$/);
  if(match){const [,collection,suppliedId]=match;
    if(req.method==='GET'){const rows=db.prepare('SELECT id,data,updated_at FROM records WHERE collection=? ORDER BY updated_at DESC').all(collection);return json(res,200,{records:rows.map(row=>({id:row.id,data:JSON.parse(row.data),updatedAt:row.updated_at}))});}
    if(req.method==='PUT'){const value=await body(req);if(!value || typeof value!=='object' || Array.isArray(value))return json(res,400,{error:'Record must be an object'});const encoded=JSON.stringify(value);if(encoded.length>100000)return json(res,400,{error:'Record too large'});const id=suppliedId || randomUUID(),updatedAt=new Date().toISOString();db.prepare('INSERT INTO records(collection,id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(collection,id,encoded,updatedAt);return json(res,200,{id,data:value,updatedAt});}
    if(req.method==='DELETE' && suppliedId){db.prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection,suppliedId);return json(res,200,{ok:true});}
    return json(res,405,{error:'Method not supported'});
  }
  if(pathname==='/api/uploads' && req.method==='POST'){
    const input=await body(req);if(typeof input.content!=='string' || typeof input.name!=='string')return json(res,400,{error:'File content and name required'});
    const buffer=Buffer.from(input.content,'base64');if(buffer.length>8*1024*1024)return json(res,400,{error:'File exceeds 8 MB'});
    const id=randomUUID(),type=typeof input.type==='string' && /^image\/(png|jpeg|webp|gif)$/.test(input.type)?input.type:'application/octet-stream';
    await writeFile(path.join(dataDir,'uploads',id),buffer);db.prepare('INSERT INTO uploads(id,name,type) VALUES(?,?,?)').run(id,input.name.slice(0,200),type);
    return json(res,200,{id,name:input.name,url:base+'/api/uploads/'+id});
  }
  if(pathname.startsWith('/api/uploads/') && req.method==='GET'){
    const id=pathname.slice('/api/uploads/'.length);if(!namePattern.test(id))return json(res,404,{error:'Not found'});
    const row=db.prepare('SELECT type FROM uploads WHERE id=?').get(id);if(!row)return json(res,404,{error:'Not found'});
    const buffer=await readFile(path.join(dataDir,'uploads',id));res.writeHead(200,{'content-type':row.type,'x-content-type-options':'nosniff'});return res.end(buffer);
  }
  if(pathname.startsWith('/api/'))return json(res,404,{error:'Endpoint not found'});
  if(req.method!=='GET' && req.method!=='HEAD')return json(res,405,{error:'Method not supported'});
  const root=path.resolve('dist');let file=path.resolve(root,'.'+decodeURIComponent(pathname));if(file!==root && !file.startsWith(root+path.sep))return json(res,400,{error:'Invalid path'});
  let bytes;try{bytes=await readFile(file);}catch{file=path.join(root,'index.html');bytes=await readFile(file);}
  res.writeHead(200,{'content-type':mime[path.extname(file)] || 'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes);
}catch(error){json(res,500,{error:error instanceof Error?error.message:'Request failed'});}});
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '0.0.0.0');
`;
