import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTeachingEvidenceLlmPayload } from './compact-input';
const segments=[{id:'s1',startMs:0,endMs:5000,speakerLabel:'教师',text:'这位同学说答案是五，我们继续讲。',confidence:0.9}];
test('simulated demo excludes all bidirectional interaction metrics and passes scene tag',()=>{
 const p=buildTeachingEvidenceLlmPayload({lessonId:'demo',lesson_format:'teacher_certification_interview',transcriptSegments:segments,metrics:[],generationConfig:{language:'zh-CN'}});
 assert.equal((p as any).scene_type,'simulated_demo');
 for(const c of ['feedback_quality','learning_check_level','simulated_interaction_quality','question_quality'])assert.equal(p.ap.p.includes(c as any),false,c);
});
test('unknown student audio is a review flag, not proof of no real students',()=>{
 const p=buildTeachingEvidenceLlmPayload({lessonId:'real',lesson_format:'offline_classroom_recording',transcriptSegments:segments,metrics:[],generationConfig:{language:'zh-CN'}});
 assert.equal((p as any).scene_cross_check.requiresReview,true);
 assert.equal(p.ap.p.includes('feedback_quality'),false);
});
