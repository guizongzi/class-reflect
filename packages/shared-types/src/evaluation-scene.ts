import scenePolicy from './scene-metric-bindings.json';
import {sceneCategoryAllowed, sceneMetricId, allowedSceneIds} from './scene-metric-policy';
import type { ClassroomMetric, EvidenceCategory, LessonFormat, TranscriptSegment } from './index';
export type EvaluationScene = 'real_classroom' | 'recorded_instruction' | 'simulated_demo' | 'unconfirmed';
export type EvaluationScope = 'real_interaction' | 'teaching_presentation';
export type EvaluationContext = {
  version: 'scene.v1'; sceneType: EvaluationScene; evaluationScope: EvaluationScope;
  sourceFormat: LessonFormat | null; sceneRevision: number; labelSource: 'lesson_format';
  interactionEnabled: boolean; requiresReview: boolean; reviewReasons: string[];
  features: { teacherSegments: number; studentSegments: number; unknownSegments: number; teacherStudentPairs: number };
};
export const interactionEvidenceCategories = scenePolicy.interactionCategories as EvidenceCategory[];
export function canonicalLessonFormat(value: unknown): LessonFormat | null {
  if(value==='teacher_qualification_demo')return 'teacher_certification_interview';
  return ['offline_classroom_recording','live_online_class','recorded_online_class','teacher_certification_interview'].includes(String(value)) ? value as LessonFormat : null;
}
function role(segment:TranscriptSegment):'teacher'|'student'|'unknown' {
  const label=segment.speakerLabel||'';
  if(/^(教师|老师|师|teacher)(?:\s*[A-Z\d一二三四五六七八九十]+)?$/i.test(label.trim()))return 'teacher';
  if(/^(学生|同学|全班|学生们|齐答|student|students|生)(?:\s*[A-Z\d一二三四五六七八九十]+)?$/i.test(label.trim()))return 'student';
  return 'unknown';
}
export function buildEvaluationContext(format:unknown,segments:TranscriptSegment[],sceneRevision=1):EvaluationContext {
  const sourceFormat=canonicalLessonFormat(format);
  const sceneType:EvaluationScene=sourceFormat==='recorded_online_class'?'recorded_instruction':sourceFormat==='teacher_certification_interview'?'simulated_demo':sourceFormat?'real_classroom':'unconfirmed';
  const roles=[...segments].sort((a,b)=>a.startMs-b.startMs).map(role);
  const features={teacherSegments:roles.filter(r=>r==='teacher').length,studentSegments:roles.filter(r=>r==='student').length,unknownSegments:roles.filter(r=>r==='unknown').length,teacherStudentPairs:roles.filter((r,i)=>r==='student' && roles[i-1]==='teacher').length};
  const reviewReasons:string[]=[];
  if(!sourceFormat)reviewReasons.push('scene_label_missing_or_invalid');
  if(sceneType==='real_classroom' && !features.studentSegments)reviewReasons.push('student_audio_not_observed');
  if(sceneType==='real_classroom' && !features.teacherStudentPairs)reviewReasons.push('bidirectional_turns_not_observed');
  if((sceneType==='recorded_instruction'||sceneType==='simulated_demo') && features.studentSegments)reviewReasons.push('student_roles_conflict_with_scene_label');
  const interactionEnabled=sceneType==='real_classroom' && features.studentSegments>0 && features.teacherStudentPairs>0;
  return {version:'scene.v1',sceneType,evaluationScope:interactionEnabled?'real_interaction':'teaching_presentation',sourceFormat,sceneRevision,labelSource:'lesson_format',interactionEnabled,requiresReview:reviewReasons.length>0,reviewReasons,features};
}
export function isEvaluationCategoryAllowed(context:EvaluationContext,category:EvidenceCategory):boolean {
  return sceneCategoryAllowed(context,category);
}
export function isInteractionMetric(metric:Pick<ClassroomMetric,'name'>):boolean {
  const id=sceneMetricId({id:'',name:metric.name});
  const context=buildEvaluationContext('teacher_certification_interview',[]);
  return !!id && !allowedSceneIds(context,'metric').includes(id);
}
export function evaluationSceneLabel(context:EvaluationContext):string {
  const scene={real_classroom:'真实课堂',recorded_instruction:'录播讲解',simulated_demo:'模拟试讲',unconfirmed:'场景未确认'}[context.sceneType];
  return `${scene} · ${context.evaluationScope==='real_interaction'?'真实互动分析':'教学呈现分析'}${context.requiresReview?'（场景待复核）':''}`;
}
export function evaluationSceneNotice(context:EvaluationContext):string {
  return context.interactionEnabled ? '仅依据材料中可观察的师生交互分析，不推断学生整体掌握程度。' : '双向师生互动指标已关闭；本结果反映教学呈现，不代表真实课堂互动水平。无学生侧语音不能证明课堂没有学生；无画面不评价板书/课件，无明确时长要求不判断试讲超时。';
}
export function isEvaluationContextCurrent(value:unknown,format:unknown,revision:number):value is EvaluationContext {
  if(!value || typeof value!=='object')return false;
  const c=value as EvaluationContext;
  const declared=canonicalLessonFormat(format);
  const expected=declared==='recorded_online_class'?'recorded_instruction':declared==='teacher_certification_interview'?'simulated_demo':declared?'real_classroom':'unconfirmed';
  if(c.version!=='scene.v1'||c.sourceFormat!==declared||c.sceneType!==expected||c.sceneRevision!==revision)return false;
  if(c.evaluationScope!=='real_interaction' && c.evaluationScope!=='teaching_presentation')return false;
  if(c.interactionEnabled)return c.sceneType==='real_classroom' && c.evaluationScope==='real_interaction' && c.features?.studentSegments>0 && c.features?.teacherStudentPairs>0;
  return c.evaluationScope==='teaching_presentation';
}

export function summarizeSceneMetricGuard(context:EvaluationContext,attempted:EvidenceCategory[],emitted:EvidenceCategory[]) {
  return {sceneType:context.sceneType,evaluationScope:context.evaluationScope,sceneRevision:context.sceneRevision,
    interactionCandidateCount:attempted.filter(c=>interactionEvidenceCategories.includes(c)).length,
    blockedInteractionCount:attempted.filter(c=>!isEvaluationCategoryAllowed(context,c)).length,
    emittedInteractionCount:emitted.filter(c=>interactionEvidenceCategories.includes(c)).length,
    violationCount:emitted.filter(c=>!isEvaluationCategoryAllowed(context,c)).length};
}
