import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWorkflowConfig, validateWorkflowSnapshot, withWorkflowConfig, getWorkflowConfig, publicWorkflowConfig } from './workflow-config';
test('configuration snapshots are stable frozen and public projection excludes prompts', () => {
 const a=loadWorkflowConfig(), b=loadWorkflowConfig(); assert.equal(a.hash,b.hash); assert.ok(Object.isFrozen(a.config.window));
 assert.equal(JSON.stringify(publicWorkflowConfig(a)).includes('prompts'),false);
 assert.throws(()=>validateWorkflowSnapshot({...a,hash:'bad'}),/hash/);
});
test('invalid budgets missing steps and unknown handlers reject',()=>{
 const config=JSON.parse(JSON.stringify(loadWorkflowConfig().config));
 config.failurePolicies.schemaRetries=-1; assert.throws(()=>loadWorkflowConfig(config)); config.failurePolicies.schemaRetries=1;
 config.steps=[]; assert.throws(()=>loadWorkflowConfig(config));
 config.steps=[{key:'unknown',handler:'arbitrary'}];assert.throws(()=>loadWorkflowConfig(config));
});
test('async snapshot is pinned and isolated across await', async()=>{
 const base=loadWorkflowConfig(); const config=JSON.parse(JSON.stringify(base.config)); config.window.size=12;
 const custom=loadWorkflowConfig(config);
 await Promise.all([withWorkflowConfig(custom,async()=>{await Promise.resolve();assert.equal(getWorkflowConfig().window.size,12);}),withWorkflowConfig(base,async()=>{await Promise.resolve();assert.equal(getWorkflowConfig().window.size,80);})]);
});
test('step order human gates and schema vocabulary are validated at load',()=>{
 const clone=()=>JSON.parse(JSON.stringify(loadWorkflowConfig().config));let c=clone();[c.steps[0],c.steps[1]]=[c.steps[1],c.steps[0]];assert.throws(()=>loadWorkflowConfig(c));c=clone();c.steps.find((s:any)=>s.key==='wait_human_review').human=false;assert.throws(()=>loadWorkflowConfig(c));c=clone();c.schemas.evidence.properties.evidenceCards.type='strange';assert.throws(()=>loadWorkflowConfig(c));c=clone();c.retrieval.maxCases=1.5;assert.throws(()=>loadWorkflowConfig(c));
});
test('native schemas allow optional properties but reject required fields absent from properties',()=>{
 const config=JSON.parse(JSON.stringify(loadWorkflowConfig().config));config.llm.responseFormat='json_schema';const strict=(s:any)=>{if(s.type==='object'){s.additionalProperties=false;Object.values(s.properties||{}).forEach(strict);}if(s.type==='array')strict(s.items);};Object.values(config.schemas).forEach(strict);
 assert.doesNotThrow(()=>loadWorkflowConfig(config));config.schemas.normalizer.required.push('notDefined');assert.throws(()=>loadWorkflowConfig(config),/required/);
});
test('scene category bindings cannot reference confidence labels or unknown categories',()=>{
 const config=JSON.parse(JSON.stringify(loadWorkflowConfig().config));config.sceneProfiles.scenes['simulated_demo:teaching_presentation'].allowed_category_ids.push('medium');assert.throws(()=>loadWorkflowConfig(config),/category/);
});
