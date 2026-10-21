import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import defaultsRaw from './workflow/default.json';
import sceneProfiles from './workflow/scene-profiles.json';
import {setSceneProfileResolver} from './browser';
const defaults={...defaultsRaw,sceneProfiles};
export type WorkflowConfig = typeof defaults;
export type WorkflowConfigSnapshot = {version:string;hash:string;config:WorkflowConfig};
const context=new AsyncLocalStorage<{snapshot:WorkflowConfigSnapshot;strictFailures:boolean}>();
function canonical(value:unknown):string { if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as any)[k])}`).join(',')}}`;return JSON.stringify(value); }
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function validate(config:WorkflowConfig){
 if(!config||typeof config.version!=='string'||!Array.isArray(config.steps)||config.steps.length!==defaults.steps.length)throw new Error('Invalid workflow steps');
 const keys=new Set<string>();for(const [index,step] of config.steps.entries()){if(step.key!==defaults.steps[index].key||step.human!==defaults.steps[index].human)throw new Error("Invalid workflow order or human gate");if(!defaults.steps.some(s=>s.key===step.key&&s.handler===step.handler)||keys.has(step.key))throw new Error('Unknown or duplicate workflow handler');keys.add(step.key);}
 if(!Number.isFinite(config.execution?.leaseMs)||config.execution.leaseMs<1000||!Number.isFinite(config.execution?.heartbeatMs)||config.execution.heartbeatMs<1||config.execution.heartbeatMs>=config.execution.leaseMs)throw new Error("Invalid execution lease");
 if(!config.sections||Object.values(config.sections).some(v=>!Number.isFinite(v)||v<=0)||config.sections.lowConfidence>1)throw new Error('Invalid section thresholds');
 const p=config.failurePolicies;for(const key of ['schemaRetries','providerRetries'] as const)if(!Number.isInteger(p?.[key])||p[key]<0||p[key]>10)throw new Error('Invalid retry budget');
 for(const key of ['baseDelayMs','maxDelayMs','circuitThreshold','circuitOpenMs'] as const)if(!Number.isFinite(p[key])||p[key]<=0)throw new Error('Invalid failure policy');
 if(p.maxDelayMs<p.baseDelayMs)throw new Error('Invalid backoff range');
 if(!Number.isInteger(config.window?.size)||config.window.size<1||!Number.isInteger(config.window.overlap)||config.window.overlap<0||config.window.overlap>=config.window.size)throw new Error('Invalid window');
 if(!Number.isFinite(config.llm?.timeoutMs)||config.llm.timeoutMs<=0||!['json_object','json_schema'].includes(config.llm.responseFormat))throw new Error('Invalid LLM configuration');
 if(!Number.isFinite(config.llm.temperature)||config.llm.temperature<0||config.llm.temperature>2||!Array.isArray(config.llm.strictSchemaModels)||config.llm.strictSchemaModels.some(v=>typeof v!=="string")||!Array.isArray(config.llm.strictSchemaEndpoints)||config.llm.strictSchemaEndpoints.some(v=>typeof v!=="string"||!v))throw new Error("Invalid LLM capability configuration");
 if(!Number.isInteger(p.circuitThreshold))throw new Error("Invalid circuit threshold");
 if(!config.prompts?.normalizer||!config.prompts.evidence||!config.schemas?.normalizer||!config.schemas.evidence)throw new Error('Missing prompt or schema');
 validateSchemaDefinition(config.schemas.normalizer);validateSchemaDefinition(config.schemas.evidence);
 if(config.llm.responseFormat==="json_schema"){validateStrictSchema(config.schemas.normalizer);validateStrictSchema(config.schemas.evidence);}
 if(!config.sceneProfiles?.scenes||!config.sceneProfiles.legacyNames||!Array.isArray(config.sceneProfiles.interactionCategories))throw new Error("Invalid scene profiles");
 const categoryCatalog=config.sceneProfiles.categoryCatalog as string[];
 if(!Array.isArray(categoryCatalog)||config.sceneProfiles.interactionCategories.some(id=>!categoryCatalog.includes(id)))throw new Error('Invalid category catalog');
 for(const binding of Object.values(config.sceneProfiles.scenes))if(binding.allowed_category_ids.some(id=>!categoryCatalog.includes(id)))throw new Error('Unknown scene category binding');
 for(const binding of Object.values(config.sceneProfiles.scenes))for(const ids of [binding.allowed_metric_ids,binding.allowed_category_ids])if(!Array.isArray(ids)||ids.some(id=>typeof id!=="string"))throw new Error("Invalid scene binding");
 if(!config.retrieval||!Number.isInteger(config.retrieval.maxCases)||!Number.isInteger(config.retrieval.maxCharacters)||config.retrieval.maxCases<0||config.retrieval.maxCases>2||config.retrieval.maxCharacters<1)throw new Error('Invalid retrieval limits');
 for(const v of Object.values(config.metrics||{}))if(!Number.isFinite(v)||v<=0)throw new Error('Invalid metric threshold');
}
function validateStrictSchema(schema:any):void{if(schema.type==="object"){if(schema.additionalProperties!==false)throw new Error("Strict schema must disallow extras");Object.values(schema.properties||{}).forEach(validateStrictSchema);}if(schema.type==="array")validateStrictSchema(schema.items);}
function validateSchemaDefinition(schema:any):void{
 if(!schema||!["object","array","string","number","integer","boolean","null"].includes(schema.type))throw new Error("Invalid schema type");
 const allowed=new Set(["type","properties","required","additionalProperties","items","enum","minimum","maximum","minItems"]);if(Object.keys(schema).some(k=>!allowed.has(k)))throw new Error("Unsupported schema keyword");
 if(schema.type==="object"){if(schema.required&&(!Array.isArray(schema.required)||schema.required.some((k:unknown)=>typeof k!=="string"||!(k in (schema.properties||{})))))throw new Error("Invalid schema required");for(const child of Object.values(schema.properties||{}))validateSchemaDefinition(child);}
 if(schema.type==="array")validateSchemaDefinition(schema.items);
}
export function loadWorkflowConfig(value:unknown=defaults):WorkflowConfigSnapshot{const config=JSON.parse(JSON.stringify(value)) as WorkflowConfig;validate(config);return freeze({version:config.version,hash:createHash('sha256').update(canonical(config)).digest('hex'),config});}
export function validateWorkflowSnapshot(value:unknown):WorkflowConfigSnapshot{const input=value as WorkflowConfigSnapshot;const snapshot=loadWorkflowConfig(input?.config);if(snapshot.hash!==input.hash||snapshot.version!==input.version)throw new Error('Workflow snapshot hash/version mismatch');return snapshot;}
const defaultSnapshot=loadWorkflowConfig();
export function getWorkflowConfig():WorkflowConfig{return (context.getStore()?.snapshot||defaultSnapshot).config;}
export function withWorkflowConfig<T>(snapshot:WorkflowConfigSnapshot,fn:()=>T,options:{strictFailures?:boolean}={}):T{return context.run({snapshot:validateWorkflowSnapshot(snapshot),strictFailures:options.strictFailures!==false},fn);}
export function isStrictWorkflowExecution(){return context.getStore()?.strictFailures===true;}
export function publicWorkflowConfig(snapshot:WorkflowConfigSnapshot=defaultSnapshot){const checked=validateWorkflowSnapshot(snapshot);return freeze({version:checked.version,hash:checked.hash,...checked.config.public});}

// Server-only registration; browser imports retain their pure static JSON default.
setSceneProfileResolver(()=>getWorkflowConfig().sceneProfiles);
