import type { Project } from './types';
/** Resolve only the configured per-project runtime host, never an arbitrary saved redirect. */
export function publishedProjectUrl(project:Pick<Project,'id'|'previewUrl'>,requestUrl:string){
 const request=new URL(requestUrl);const pathname=`/apps/${encodeURIComponent(project.id)}/`;
 const configured=process.env.VIBEKIDDING_RUNTIME_ORIGIN;
 if(!configured){if(process.env.VIBEKIDDING_PUBLIC_MODE==='1')throw new Error('Runtime origin is not configured.');return pathname+request.search;}
 const base=new URL(configured);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Runtime origin is invalid.');
 if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(project.id))throw new Error('Project hostname is invalid.');
 base.hostname=project.id+'.'+base.hostname;base.pathname=pathname;
 // Persisted preview links may originate from an older deployment. Canonical configuration wins.
 base.search=request.search;return base.toString();
}
