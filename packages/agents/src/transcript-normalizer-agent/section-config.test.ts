import test from 'node:test';import assert from 'node:assert/strict';
import {loadWorkflowConfig,withWorkflowConfig} from '@class-reflect/config';import {buildDisplayTranscriptSections} from './sections';
test('display segmentation thresholds follow pinned execution config',()=>{
 const segments=[{id:'1',text:'二进制。',speakerLabel:'教师',startMs:0,endMs:100},{id:'2',text:'二进制。',speakerLabel:'教师',startMs:101,endMs:200}];
 const config=JSON.parse(JSON.stringify(loadWorkflowConfig().config));config.sections={maxCharacters:5,gapMs:15000,speakerTurnMinCharacters:120,lowConfidence:0.65,uncertainDurationMs:20000,uncertainTextCharacters:8};
 assert.equal(withWorkflowConfig(loadWorkflowConfig(config),()=>buildDisplayTranscriptSections(segments)).length,2);
});
