import test from 'node:test';import assert from 'node:assert/strict';
import {loadWorkflowConfig,matchesWorkflowSchema} from './index';
test('Qwen Flash profile enables native schema and retains evidence source fields',()=>{
 const old=process.env.WORKFLOW_MODEL_PROFILE;process.env.WORKFLOW_MODEL_PROFILE='qwen3.7-flash';
 try{const c=loadWorkflowConfig().config;assert.equal(c.llm.responseFormat,'json_schema');assert.ok((c.llm.strictSchemaModels as string[]).includes('qwen3.7-flash'));const card={category:'explanation_quality',sentiment:'positive',title:'解释',fact:'说明规则',interpretation:'呈现解释',quote:'逢二进位',transcriptSegmentIds:['s1'],metricIds:[],classroomEventIds:[],confidence:'medium',reviewStatus:'pending_review',uncertaintyNote:null};assert.equal(matchesWorkflowSchema({lessonId:'l',evidenceCards:[card]},c.schemas.evidence),true);assert.equal(matchesWorkflowSchema({lessonId:'l',evidenceCards:[{...card,transcriptSegmentIds:'["s1"]'}]},c.schemas.evidence),false);}
 finally{if(old===undefined)delete process.env.WORKFLOW_MODEL_PROFILE;else process.env.WORKFLOW_MODEL_PROFILE=old;}
});
