// Passive acceptance-only observer; no business call, permission change, retry or response mutation.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const log=`E:/codexdata/lolob-release-20261014/verification-output/release-0.8.0-rc.3/native-http-${process.pid}.jsonl`;
const { _electron }=await import(pathToFileURL('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const launch=_electron.launch;
const wanted=pathname=>/^\/api\/obs\/(?:cameras|engine\/(?:output|monitor|destination|setup|start|mode)|music(?:\/control)?)$/.test(pathname);
let sequence=0;
function record(value){try{appendFileSync(log,JSON.stringify({at:new Date().toISOString(),...value})+'\n');}catch{/* Diagnostic IO must not alter acceptance or restoration. */}}
_electron.launch=async function(...args){
 const app=await launch.apply(this,args),context=app.context(),ids=new WeakMap();
 record({event:'observer-attached',scope:'method/path/time/status/error only; no body, query, headers or secret values'});
 context.on('request',request=>{const pathname=new URL(request.url()).pathname;if(!wanted(pathname))return;const id=++sequence;ids.set(request,id);record({source:'browser',event:'request',id,method:request.method(),path:pathname});});
 context.on('response',async response=>{const request=response.request(),pathname=new URL(response.url()).pathname;if(!wanted(pathname))return;const value={source:'browser',event:'response',id:ids.get(request),method:request.method(),path:pathname,status:response.status()};record(value);if(response.status()>=400){try{const data=await response.json();if(typeof data.error==='string')record({source:'browser',event:'response-error',id:value.id,status:value.status,path:pathname,error:data.error.replace(/(password|token|secret|key)\s*[:=]\s*\S+/gi,'$1=[redacted]').slice(0,600)});}catch{}}});
 context.on('requestfailed',request=>{const pathname=new URL(request.url()).pathname;if(wanted(pathname))record({source:'browser',event:'requestfailed',id:ids.get(request),method:request.method(),path:pathname,error:request.failure()?.errorText});});
 return app;
};

const originalFetch=globalThis.fetch;
globalThis.fetch=async function(input,init){const url=typeof input==='string'||input instanceof URL?String(input):input.url;const pathname=new URL(url).pathname;if(!wanted(pathname))return originalFetch.apply(this,arguments);const id=++sequence,method=init?.method||input?.method||'GET';record({source:'qa-node',event:'request',id,method,path:pathname});try{const response=await originalFetch.apply(this,arguments);record({source:'qa-node',event:'response',id,method,path:pathname,status:response.status});if(response.status>=400)response.clone().json().then(value=>{if(typeof value.error==='string')record({source:'qa-node',event:'response-error',id,path:pathname,status:response.status,error:value.error.replace(/(password|token|secret|key)\s*[:=]\s*\S+/gi,'$1=[redacted]').slice(0,600)});}).catch(()=>{});return response;}catch(error){record({source:'qa-node',event:'requestfailed',id,method,path:pathname,error:error.code||error.name});throw error;}};
