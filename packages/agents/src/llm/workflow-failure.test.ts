import assert from 'node:assert/strict';import test from 'node:test';
import {withWorkflowConfig,loadWorkflowConfig} from '@class-reflect/config';import {tryRunLlmAgent} from './provider';
test('strict workflow does not turn missing provider into successful fallback',async()=>{const keys=['LLM_BASE_URL','LLM_API_KEY','LLM_MODEL','APP_CONFIG_ENV'];const previous=keys.map(k=>process.env[k]);keys.forEach(k=>delete process.env[k]);try{await assert.rejects(()=>withWorkflowConfig(loadWorkflowConfig(),()=>tryRunLlmAgent({agentName:'test',promptVersion:'test',payload:{},validate:(_):_ is object=>true})),(error:any)=>error.kind==='configuration');}finally{keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}});
test('strict workflow retries malformed arrays within budget then throws without fallback',async()=>{
 const keys=['LLM_BASE_URL','LLM_API_KEY','LLM_MODEL'];const previous=keys.map(k=>process.env[k]);const old=globalThis.fetch;keys.forEach(k=>process.env[k]='test');let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({lessonId:'l',evidenceCards:'[]'})}}]}),{status:200});};
 try{await assert.rejects(()=>withWorkflowConfig(loadWorkflowConfig(),()=>tryRunLlmAgent({agentName:'teaching-evidence-agent',promptVersion:'test',payload:{},validate:(_):_ is any=>true})),(e:any)=>e.kind==='schema_invalid');assert.equal(calls,2);}finally{globalThis.fetch=old;keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
test('strict valid schema rejected by domain validator is business failure without retry',async()=>{
 const keys=['LLM_BASE_URL','LLM_API_KEY','LLM_MODEL'];const previous=keys.map(k=>process.env[k]);const old=globalThis.fetch;keys.forEach(k=>process.env[k]='test');let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({patches:[],warnings:[]})}}]}),{status:200});};
 try{await assert.rejects(()=>withWorkflowConfig(loadWorkflowConfig(),()=>tryRunLlmAgent({agentName:'transcript-normalizer-agent',promptVersion:'test',payload:{},validate:(_):_ is any=>false})),(e:any)=>e.kind==='business_rule_rejected');assert.equal(calls,1);}finally{globalThis.fetch=old;keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
