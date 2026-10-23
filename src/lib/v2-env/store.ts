import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { projectPath } from "../v2/store";

const RESERVED = new Set(["PORT","HOST","HOSTNAME","DATA_DIR","BASE_PATH","NODE_ENV","NODE_OPTIONS","NODE_PATH","PATH","HOME","LD_PRELOAD","LD_LIBRARY_PATH"]);
export type EnvironmentMetadata = { variables: { name:string; configured:boolean }[]; requiresRedeploy:true };
export function validateEnvironmentName(name:string) {
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.length>128)throw new Error("Environment names must start with a letter or underscore and contain only letters, numbers and underscores (up to 128 characters).");
  if(RESERVED.has(name.toUpperCase()) || name.toUpperCase().startsWith("VIBEKIDDING_"))throw new Error(`The platform manages ${name}; choose another variable name.`);
}
export function validateEnvironmentValues(values:unknown):Record<string,string>{
 if(!values || typeof values!=="object" || Array.isArray(values))throw new Error("Environment settings must be a name/value object.");
 const entries=Object.entries(values);if(entries.length>100)throw new Error("An app can have at most 100 environment variables.");
 const result:Record<string,string>=Object.create(null);
 for(const [name,value] of entries){validateEnvironmentName(name);if(typeof value!=="string" || Buffer.byteLength(value)>8192 || /[\r\n\0]/.test(value))throw new Error(`The value for ${name} must be text up to 8192 bytes without line breaks or null characters.`);result[name]=value;}
 return result;
}
async function readEnvironment(id:string):Promise<Record<string,string>>{
 try{return validateEnvironmentValues(JSON.parse(await fs.readFile(path.join(projectPath(id),"environment.json"),"utf8")));}
 catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return Object.create(null);throw error;}
}
function metadata(values:Record<string,string>):EnvironmentMetadata{return {variables:Object.keys(values).sort().map(name=>({name,configured:values[name].length>0})),requiresRedeploy:true};}
export async function environmentMetadata(id:string):Promise<EnvironmentMetadata>{return metadata(await readEnvironment(id));}
export async function updateEnvironment(id:string,input:unknown):Promise<EnvironmentMetadata>{
 if(!input || typeof input!=="object" || Array.isArray(input))throw new Error("Provide environment settings to update.");
 const patch=input as {set?:unknown;remove?:unknown};
 const set=validateEnvironmentValues(patch.set ?? {});
 if(patch.remove!==undefined && (!Array.isArray(patch.remove) || patch.remove.length>100 || patch.remove.some(name=>typeof name!=="string")))throw new Error("remove must be a list of environment variable names.");
 const remove=(patch.remove || []) as string[];for(const name of remove)validateEnvironmentName(name);
 const values=await readEnvironment(id);for(const name of remove)delete values[name];Object.assign(values,set);validateEnvironmentValues(values);
 const file=path.join(projectPath(id),"environment.json"),temp=file+"."+randomUUID()+".tmp";
 await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(temp,JSON.stringify(values),{mode:0o600});await fs.rename(temp,file);
 return metadata(values);
}
