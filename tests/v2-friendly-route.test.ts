import test from 'node:test';import assert from 'node:assert/strict';import { promises as fs } from 'node:fs';import os from 'node:os';import path from 'node:path';
import { GET } from '../src/app/[username]/route';import { createProject,saveProject } from '../src/lib/v2/store';
test('friendly app route redirects to isolated configured runtime and preserves room query',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'v2-friendly-'));const values={VIBEKIDDING_V2_DATA_DIR:root,VIBEKIDDING_RUNTIME_ORIGIN:'http://apps.localhost:3230',VIBEKIDDING_PUBLIC_MODE:'1',BASE_DOMAIN:'localhost'};const old=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);
 try{const project=await createProject('owner','Tic tac toe','Play','ash');project.deployedVersionId='version';project.previewUrl='https://evil.example/';project.status='ready';await saveProject(project);
 const result=await GET(new Request(`http://ash.localhost:3230/${project.slug}?room=abc&player=two`),{params:Promise.resolve({username:project.slug!})});assert.equal(result.status,307);assert.equal(result.headers.get('location'),`http://${project.id}.apps.localhost:3230/apps/${project.id}/?room=abc&player=two`);
 delete process.env.VIBEKIDDING_RUNTIME_ORIGIN;assert.equal((await GET(new Request(`http://ash.localhost:3230/${project.slug}`),{params:Promise.resolve({username:project.slug!})})).status,503);
 }finally{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await fs.rm(root,{recursive:true,force:true});}
});
