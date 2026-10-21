import {getSceneProfiles} from '@class-reflect/config/browser';
import type {ClassroomMetric, EvidenceCategory} from './index';
import {isEvaluationContextCurrent, type EvaluationContext} from './evaluation-scene';
export function allowedSceneIds(context:EvaluationContext,kind:'metric'|'category'):readonly string[] {
 const policy=getSceneProfiles();
 const key=`${context.sceneType}:${context.evaluationScope}` as keyof typeof policy.scenes;
 const binding=policy.scenes[key];
 return binding?.[kind==='metric'?'allowed_metric_ids':'allowed_category_ids']||[];
}
export function sceneCategoryAllowed(context:EvaluationContext,category:EvidenceCategory):boolean {return allowedSceneIds(context,'category').includes(category);}
export function sceneMetricId(metric:Pick<ClassroomMetric,'id'|'name'>):string|null {
 const policy=getSceneProfiles();
 const names=policy.legacyNames as Record<string,string>;
 if(names[metric.name])return names[metric.name];
 for(const [prefix,id] of Object.entries(policy.legacyPrefixes))if(metric.name.startsWith(prefix))return id;
 return allowedSceneIds({sceneType:'real_classroom',evaluationScope:'real_interaction'} as EvaluationContext,'metric').includes(metric.id)?metric.id:null;
}
export function checkSceneMetric(context:EvaluationContext,metric:ClassroomMetric,requireSnapshot=true) {
 const snapshot=metric.metadata?.evaluationContext as EvaluationContext|undefined;
 const current=!!snapshot && isEvaluationContextCurrent(snapshot,context.sourceFormat,context.sceneRevision) && snapshot.evaluationScope===context.evaluationScope;
 const id=sceneMetricId(metric);
 const allowed=!!id && allowedSceneIds(context,'metric').includes(id) && (!requireSnapshot||current);
 return {allowed,metricId:id,changedContext:!!snapshot&&!current};
}
export function filterSceneMetrics(context:EvaluationContext,metrics:ClassroomMetric[],options:{requireSnapshot?:boolean;onBlocked?:(event:Record<string,unknown>)=>void}={}) {
 return metrics.filter(metric=>{
  const decision=checkSceneMetric(context,metric,options.requireSnapshot!==false);
  if(!decision.allowed)options.onBlocked?.({event:'scene_metric_blocked',sceneType:context.sceneType,sceneRevision:context.sceneRevision,metricId:decision.metricId||'unknown',postChangeViolationHitCount:decision.changedContext?1:0,blockedCount:1});
  return decision.allowed;
 });
}
