import {createHash} from 'node:crypto';
import {WorkflowFailureError,allowedSceneIds} from '@class-reflect/shared-types';
import {filterSceneMetrics} from '@class-reflect/shared-types';
import { buildDisplayTranscriptSections, runTeachingEvidenceAgent, runTranscriptNormalizer } from "@class-reflect/agents";
import {
  getTeachingEvidenceSource,
  selectWorkflowFewShot,
  getLessonRecord,
  listClassroomEvents,
  listTranscriptSegments,
  saveClassroomEvents,
  saveClassroomMetrics,
  saveLessonSections,
  saveTeachingEvidenceCards,
  updateTranscriptSegmentsProjection
} from "@class-reflect/database";
import { detectClassroomEvents } from "@class-reflect/domain";
import { assertEvidenceHasSource, resolveTeachingEvidenceCardTiming, validateTeachingEvidenceCard } from "@class-reflect/guardrails";
import { calculateScopedClassroomMetrics } from "@class-reflect/metrics";
import { buildEvaluationContext, summarizeSceneMetricGuard, capabilityMatrixByLessonFormat } from "@class-reflect/shared-types";
import type { ProcessorResult, WorkflowProcessor } from "./types";

export const normalizeTranscriptProcessor: WorkflowProcessor = {
  stepKey: "normalize_transcript",
  async run(context): Promise<ProcessorResult> {
    const transcriptSegments = await listTranscriptSegments({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId
    });
    if (!transcriptSegments.length) throw new Error("还没有可用于整理的逐字稿");

    const result = await runTranscriptNormalizer(transcriptSegments, { traceId: context.traceId });
    const normalizedSegments = await updateTranscriptSegmentsProjection({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId,
      segments: result.output.normalizedSegments
    });
    return {
      output: {
        promptVersion: result.promptVersion,
        normalizedSegmentCount: normalizedSegments.length,
        analysisProjection: result.output.analysisProjection
      },
      warnings: result.warnings
    };
  }
};

export const buildSectionsProcessor: WorkflowProcessor = {
  stepKey: "build_sections",
  async run(context): Promise<ProcessorResult> {
    const transcriptSegments = await listTranscriptSegments({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId
    });
    if (!transcriptSegments.length) throw new Error("还没有可用于生成展示逐字稿的句子");

    const savedSections = await saveLessonSections({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId,
      sections: buildDisplayTranscriptSections(transcriptSegments)
    });
    return {
      output: {
        sectionCount: savedSections.length,
        sentenceCount: transcriptSegments.length,
        firstSectionId: savedSections[0]?.id || null,
        lastSectionId: savedSections[savedSections.length - 1]?.id || null,
        mode: "display_projection"
      }
    };
  }
};

export const calculateMetricsProcessor: WorkflowProcessor = {
  stepKey: "calculate_metrics",
  async run(context): Promise<ProcessorResult> {
    const transcriptSegments = await listTranscriptSegments({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId
    });
    if (!transcriptSegments.length) throw new Error("还没有可用于计算课堂指标的逐字稿");

    const lessonDetail = await getLessonRecord(context.workflow.lessonId);
    const lessonSections = (lessonDetail?.sections || []).map((section) => {
      const row = section as Record<string, unknown>;
      return {
        id: String(row.id || ""),
        lessonId: context.workflow.lessonId,
        videoId: context.workflow.videoId,
        startMs: Number(row.start_ms || row.startMs || 0),
        endMs: Number(row.end_ms || row.endMs || 0),
        title: String(row.title || "课堂片段"),
        summaryText: String(row.edited_summary_text || row.summary_text || row.summaryText || ""),
        confidenceLabel: String(row.confidence_label || row.confidenceLabel || ""),
        tags: Array.isArray(row.tags) ? row.tags.map(String) : []
      };
    });
    const loadScene=async()=>{const detail=await getLessonRecord(context.workflow.lessonId);const rows=await listTranscriptSegments({lessonId:context.workflow.lessonId,videoId:context.workflow.videoId});return buildEvaluationContext(detail?.lesson.lessonFormat,rows,detail?.lesson.sceneRevision);};
    const metrics = await calculateScopedClassroomMetrics({
      transcriptSegments,
      lessonSections
    },loadScene,event=>console.info(JSON.stringify({...event,workflowRunId:context.workflow.id})));
    const scene = await loadScene();
    if(scene.sceneRevision!==lessonDetail?.lesson.sceneRevision)throw new Error('评价过程中场景发生变化，请重新计算');
    const scopedMetrics=filterSceneMetrics(scene,metrics,{onBlocked:event=>console.info(JSON.stringify(event))});
    const savedMetrics = await saveClassroomMetrics({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId,
      evaluationContext:scene,
      metrics: scopedMetrics
    });
    return {
      output: {
        metricCount: savedMetrics.length,
        metricNames: savedMetrics.map((metric) => metric.name)
      }
    };
  }
};

export const detectEventsProcessor: WorkflowProcessor = {
  stepKey: "detect_events",
  async run(context): Promise<ProcessorResult> {
    const transcriptSegments = await listTranscriptSegments({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId
    });
    if (!transcriptSegments.length) {
      return { output: { eventCount: 0 }, warnings: ["no_transcript_for_event_detection"] };
    }
    const events = detectClassroomEvents(transcriptSegments);
    const savedEvents = await saveClassroomEvents({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId,
      events
    });
    return {
      output: {
        eventCount: savedEvents.length,
        eventTypes: [...new Set(savedEvents.map((event) => event.type))]
      }
    };
  }
};

export const generateEvidenceProcessor: WorkflowProcessor = {
  stepKey: "generate_evidence",
  async run(context): Promise<ProcessorResult> {
    const source = await getTeachingEvidenceSource({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId
    });
    if (!source) throw new Error(`课堂记录不存在：${context.workflow.lessonId}`);
    if (!source.transcriptSegments.length) {
      throw new Error("还没有可用于生成教学证据的逐字稿");
    }

    const classroomEvents = await listClassroomEvents({ lessonId: source.lesson.id, videoId: context.workflow.videoId });
    const scene = buildEvaluationContext(source.lesson.sceneLabelConfirmed ? source.lesson.lessonFormat : null,source.transcriptSegments,source.lesson.sceneRevision);
    const references=await selectWorkflowFewShot({scene:scene.sceneType,categories:[...allowedSceneIds(scene,'category')],lessonId:source.lesson.id,sourceHash:createHash('sha256').update(source.transcriptSegments.map(s=>s.text).join('\n')).digest('hex')});
    const result = await runTeachingEvidenceAgent({
      auxiliaryCases:references.cards,
      lessonId: source.lesson.id,
      traceId: context.traceId,
      lesson_format: source.lesson.lessonFormat,
      sceneLabelConfirmed: source.lesson.sceneLabelConfirmed,
      sceneRevision: source.lesson.sceneRevision,
      capabilityMatrix: capabilityMatrixByLessonFormat[source.lesson.lessonFormat],
      transcriptSegments: source.transcriptSegments,
      metrics: source.metrics,
      classroomEvents,
      generationConfig: {
        language: "zh-CN",
        minimumConfidence: "low"
      }
    });

    const resolvedCards = result.output.evidenceCards.map((card) =>
      resolveTeachingEvidenceCardTiming(card, source.transcriptSegments)
    );
    const validCards = resolvedCards.filter((card) =>
      validateTeachingEvidenceCard({
        lesson_format: source.lesson.lessonFormat,
        card,
        evaluationContext: scene,
        transcriptSegments: source.transcriptSegments,
        metrics: source.metrics,
        classroomEvents
      }).valid
    );
    const sceneMetricGuard=summarizeSceneMetricGuard(scene,result.output.evidenceCards.map(c=>c.category),validCards.map(c=>c.category));
    const generationSceneGuard=result.output.sceneMetricGuard;
    console.info(JSON.stringify({event:"scene_metric_guard",workflowRunId:context.workflow.id,scene_type:scene.sceneType,evaluation_scope:scene.evaluationScope,generation:generationSceneGuard,storage:sceneMetricGuard}));
    if(validCards.length!==resolvedCards.length)throw new WorkflowFailureError('business_rule_rejected','EVIDENCE_RULE_REJECTED','候选证据未通过业务核验，请优先人工复核');
    const savedCards = await saveTeachingEvidenceCards({
      lessonId: source.lesson.id,
      videoId: context.workflow.videoId,
      cards: validCards,
      evaluationContext: scene,
      sourceModel: result.promptVersion
    });

    return {
      output: {
        evaluationContext: scene,
        fewShotReleaseId:references.releaseId,
        sceneMetricGuard:{generation:generationSceneGuard,storage:sceneMetricGuard},
        promptVersion: result.promptVersion,
        instructionalContext: result.output.instructionalContext,
        generatedEvidenceCount: result.output.evidenceCards.length,
        validEvidenceCount: validCards.length,
        savedEvidenceCount: savedCards.length,
        skippedCategories: result.output.skippedCategories,
        generationSummary: result.output.generationSummary
      },
      warnings: result.warnings
    };
  }
};

export const validateEvidenceProcessor: WorkflowProcessor = {
  stepKey: "validate_evidence",
  async run(): Promise<ProcessorResult> {
    const validation = assertEvidenceHasSource({ sources: [] });
    if (!validation.valid) {
      return {
        output: { validEvidenceCount: 0, rejectedReason: validation.reason },
        warnings: ["no_evidence_to_validate"]
      };
    }
    return { output: { validEvidenceCount: 1 } };
  }
};
