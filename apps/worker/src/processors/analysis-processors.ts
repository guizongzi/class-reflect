import { runTeachingEvidenceAgent, runTranscriptNormalizer } from "@class-reflect/agents";
import {
  getTeachingEvidenceSource,
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
import { assertEvidenceHasSource, validateTeachingEvidenceCard } from "@class-reflect/guardrails";
import { calculateDeterministicClassroomMetrics } from "@class-reflect/metrics";
import { capabilityMatrixByLessonFormat } from "@class-reflect/shared-types";
import type { ProcessorResult, WorkflowProcessor } from "./types";

export const normalizeTranscriptProcessor: WorkflowProcessor = {
  stepKey: "normalize_transcript",
  async run(context): Promise<ProcessorResult> {
    const transcriptSegments = await listTranscriptSegments({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId
    });
    if (!transcriptSegments.length) throw new Error("还没有可用于整理的逐字稿");

    const result = await runTranscriptNormalizer(transcriptSegments);
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

    const result = await runTranscriptNormalizer(transcriptSegments);
    const savedSections = await saveLessonSections({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId,
      sections: result.output.displaySections
    });
    return {
      output: {
        sectionCount: savedSections.length,
        sentenceCount: transcriptSegments.length,
        firstSectionId: savedSections[0]?.id || null,
        lastSectionId: savedSections[savedSections.length - 1]?.id || null,
        mode: "display_projection"
      },
      warnings: result.warnings
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
    const metrics = calculateDeterministicClassroomMetrics({
      transcriptSegments,
      lessonSections
    });
    const savedMetrics = await saveClassroomMetrics({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId,
      metrics
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

    const result = await runTeachingEvidenceAgent({
      lessonId: source.lesson.id,
      lesson_format: source.lesson.lessonFormat,
      capabilityMatrix: capabilityMatrixByLessonFormat[source.lesson.lessonFormat],
      transcriptSegments: source.transcriptSegments,
      metrics: source.metrics,
      classroomEvents: await listClassroomEvents({ lessonId: source.lesson.id, videoId: context.workflow.videoId }),
      generationConfig: {
        language: "zh-CN",
        maxEvidenceCards: 6,
        minimumConfidence: "low"
      }
    });

    const validCards = result.output.evidenceCards.filter((card) =>
      validateTeachingEvidenceCard({ lesson_format: source.lesson.lessonFormat, card }).valid
    );
    const savedCards = await saveTeachingEvidenceCards({
      lessonId: source.lesson.id,
      videoId: context.workflow.videoId,
      cards: validCards,
      sourceModel: result.promptVersion
    });

    return {
      output: {
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
