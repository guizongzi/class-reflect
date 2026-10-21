import assert from 'node:assert/strict';
import test from 'node:test';
import {loadWorkflowConfig,getWorkflowConfig} from '@class-reflect/config';
import {getTraceContext} from '@class-reflect/observability';
import {workflowStepOptions} from '@class-reflect/shared-types';

test('one run retains trace/config and pauses at both human nodes across worker invocations',async()=>{
 const db=require('@class-reflect/database');
 const modules=['../processors/upload-processors','../processors/media-processors','../processors/asr-processors','../processors/analysis-processors','../processors/report-processors'].map(path=>require(path));
 const originals=new Map<string,unknown>();const patch=(key:string,value:unknown)=>{originals.set(key,db[key]);db[key]=value;};
 const snapshot=loadWorkflowConfig();const run:any={id:'run-fixed',lessonId:'lesson',videoId:'video',traceId:'trace-fixed',fencingToken:1,retryCount:0,retryAttempt:0,status:'running',progress:0,output:{}};
 const steps:any[]=workflowStepOptions.map(s=>({...s,stepKey:s.key,status:['create_lesson','upload_video','upload_audio'].includes(s.key)?'completed':'waiting'}));
 const called:string[]=[];const oldRuns:Array<[any,any]>=[];const lookupIds:string[]=[];
 patch('pinWorkflowConfig',async(id:string)=>{assert.equal(id,run.id);return snapshot;});
 patch('getWorkflowStatusForLesson',async()=>{throw new Error('latest lesson run must not be read');});
 patch('getWorkflowStatusById',async(id:string)=>{lookupIds.push(id);return {task:{...run},steps:steps.map(s=>({...s}))};});
 patch('updateWorkflowRunStatus',async(input:any)=>{assert.equal(input.workflowRunId,run.id);Object.assign(run,{status:input.status,currentStep:input.currentStep});if(input.output)Object.assign(run.output,input.output);});
 patch('updateWorkflowStep',async(input:any)=>{assert.equal(input.workflowRunId,run.id);Object.assign(steps.find(s=>s.stepKey===input.stepKey),{status:input.status});});
 patch('getWorkflowInputVersion',async()=>({scene_revision:1,transcript_version:'3:3'}));
 patch('claimWorkflowStep',async(input:any)=>{assert.equal(input.runId,run.id);return {executionId:input.stepKey,runId:run.id,workerToken:run.fencingToken,attempt:1};});
 patch('resolveWorkflowFailures',async()=>{});
 patch('getCompletedStepResult',async()=>null);patch('renewWorkflowLease',async()=>true);patch('completeWorkflowStep',async()=>true);
 patch('checkModelCircuit',async()=>({epoch:0,probeToken:null}));patch('resetModelCircuit',async()=>true);
 patch('persistWorkflowFailure',async(failure:any)=>{throw new Error(`Unexpected failure ${failure.code}`);});
 for(const mod of modules)for(const processor of Object.values(mod) as any[]){if(!processor?.stepKey||typeof processor.run!=='function')continue;oldRuns.push([processor,processor.run]);processor.run=async()=>{called.push(processor.stepKey);assert.equal(getTraceContext()?.traceId,run.traceId);assert.equal(getTraceContext()?.runId,run.id);assert.equal(getWorkflowConfig().version,snapshot.version);return {output:{ok:true}};};}
 try{
  const {runLessonAnalysisPipeline}=require('./lesson-analysis-pipeline');
  await runLessonAnalysisPipeline(run);assert.equal(run.status,'waiting_for_human');assert.equal(run.currentStep,'build_sections');assert.equal(called.includes('calculate_metrics'),false);
  // A duplicate upload callback can requeue the run; an unconfirmed gate must still pause.
  run.status='running';run.fencingToken++;await runLessonAnalysisPipeline(run);assert.equal(run.status,'waiting_for_human');assert.equal(run.currentStep,'build_sections');assert.equal(called.includes('calculate_metrics'),false);
  // Simulate explicit human confirmation, preserving run identity.
  run.output.build_sections.confirmedAt='confirmed';run.status='running';run.fencingToken++;
  await runLessonAnalysisPipeline(run);assert.equal(run.status,'waiting_for_human');assert.equal(run.currentStep,'wait_human_review');assert.equal(called.includes('generate_report'),false);
  steps.find(s=>s.stepKey==='wait_human_review').status='completed';run.output.wait_human_review.confirmedAt='confirmed';run.status='running';run.fencingToken++;
  await runLessonAnalysisPipeline(run);assert.equal(run.status,'completed');assert.equal(called.filter(k=>k==='generate_report').length,1);assert.equal(new Set(lookupIds).size,1);assert.equal(called.filter(k=>k==='generate_evidence').length,1);
 }finally{for(const [key,value]of originals)db[key]=value;for(const [processor,old]of oldRuns)processor.run=old;}
});
