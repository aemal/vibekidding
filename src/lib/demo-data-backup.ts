import { DEMO_DATA_LIMITS, snapshotDemoData, replaceDemoData, validateProjectRecords } from './demo-project-storage';
export const MAX_DATA_BACKUP_BYTES = DEMO_DATA_LIMITS.projectBytes + 128;
export type DataBackupErrorCode = 'invalid'|'too-large'|'unavailable'|'conflict'|'outcome-unknown';
const messages:Record<DataBackupErrorCode,string>={
 invalid:'This is not a valid VibeKidding app-data backup. No data was restored.',
 'too-large':'This app-data backup exceeds the project data limits. No data was restored.',
 unavailable:'Saved app data could not be read. No restore was attempted.',
 conflict:'This project’s saved data changed. Review a fresh backup preview before replacing it.',
 'outcome-unknown':'The restore could not be confirmed. Reopen the project to check its saved data before trying again.',
};
export class DemoDataBackupError extends Error{constructor(public readonly code:DataBackupErrorCode){super(messages[code]);this.name='DemoDataBackupError'}}
function translated(error:unknown):never{const code=error instanceof Error&&Object.prototype.hasOwnProperty.call(messages,error.message)?error.message as DataBackupErrorCode:'invalid';throw new DemoDataBackupError(code)}
function checked(records:unknown){try{return validateProjectRecords(records)}catch(error){return translated(error)}}
function summary(records:Record<string,string>){return{keyCount:Object.keys(records).length,byteSize:new TextEncoder().encode(JSON.stringify({version:1,records})).length}}
export type ParsedDataBackup=Readonly<{records:Readonly<Record<string,string>>;keyCount:number;byteSize:number}>;
export function snapshotProjectData(storage:Pick<Storage,'getItem'>,projectId:string):{records:Readonly<Record<string,string>>;baseline:string|null}{
 try{const value=snapshotDemoData(storage,projectId);return{records:Object.freeze(value.records),baseline:value.baseline}}catch(error){return translated(error)}
}
export function encodeDataBackup(records:Readonly<Record<string,string>>):string{
 return JSON.stringify({format:'vibekidding-app-data',version:1,records:checked(records)});
}
export function parseDataBackup(source:string):ParsedDataBackup{
 if(typeof source!=='string')throw new DemoDataBackupError('invalid');
 if(source.length>MAX_DATA_BACKUP_BYTES||new TextEncoder().encode(source).length>MAX_DATA_BACKUP_BYTES)throw new DemoDataBackupError('too-large');
 let value;try{value=JSON.parse(source)}catch{throw new DemoDataBackupError('invalid')}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='format,records,version'||value.format!=='vibekidding-app-data'||value.version!==1)throw new DemoDataBackupError('invalid');
 const records=checked(value.records);return Object.freeze({records:Object.freeze(records),...summary(records)});
}
export function restoreProjectData(storage:Pick<Storage,'getItem'|'setItem'>,projectId:string,parsed:ParsedDataBackup,expectedBaseline:string|null):void{
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).sort().join(',')!=='byteSize,keyCount,records')throw new DemoDataBackupError('invalid');
 const records=checked(parsed.records),actual=summary(records);
 if(actual.keyCount!==parsed.keyCount||actual.byteSize!==parsed.byteSize)throw new DemoDataBackupError('invalid');
 try{replaceDemoData(storage,projectId,records,expectedBaseline)}catch(error){translated(error)}
}
