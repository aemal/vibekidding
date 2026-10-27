import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GET } from '../src/app/api/v2/projects/[id]/download/route';
import { setupAccount,newSession } from '../src/lib/v2-auth/session';
import { createProject,saveVersion } from '../src/lib/v2/store';
import { starterFiles } from '../src/lib/v2/scaffold';

test('download route requires owner session, denies cross-origin access, and exports current source',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'v2-export-route-'));const old=process.env.VIBEKIDDING_V2_DATA_DIR;process.env.VIBEKIDDING_V2_DATA_DIR=root;
 try{
  const user=await setupAccount('exporter','fixture password only');const token=newSession(user);
  const project=await createProject(user.userId,'Export app','A test');
  const other=await createProject('different-owner','Other app','Other');
  const request=(authenticated=true,origin?:string)=>new Request('http://localhost:3000/api/v2/projects/'+project.id+'/download',{headers:{...(authenticated?{cookie:'vk_studio_session='+token}:{}),...(origin?{origin}: {})}});
  const ctx=(id:string)=>({params:Promise.resolve({id})});
  assert.equal((await GET(request(false),ctx(project.id))).status,401);
  assert.equal((await GET(request(),ctx(other.id))).status,404);
  assert.equal((await GET(request(true,'https://unrelated.example'),ctx(project.id))).status,403);
  assert.equal((await GET(request(),ctx(project.id))).status,409);
  await saveVersion(project,'initial',starterFiles());
  const response=await GET(request(),ctx(project.id));assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');assert.equal(response.headers.get('cache-control'),'private, no-store');
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.readUInt32LE(0),0x04034b50);assert.ok(bytes.includes(Buffer.from('package.json')));
 }finally{if(old===undefined)delete process.env.VIBEKIDDING_V2_DATA_DIR;else process.env.VIBEKIDDING_V2_DATA_DIR=old;await fs.rm(root,{recursive:true,force:true});}
});
