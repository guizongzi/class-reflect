export function summarizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return { type: typeof payload };

  const candidate = payload as Record<string, unknown>;
  return {
    type: "object",
    keys: Object.keys(candidate).slice(0, 10),
    segmentCount: Array.isArray(candidate.segments) ? candidate.segments.length : undefined,
    metricCount: Array.isArray(candidate.metrics) ? candidate.metrics.length : undefined,
    classroomEventCount: Array.isArray(candidate.classroomEvents) ? candidate.classroomEvents.length : undefined
  };
}

export function summarizeResult(value: unknown) {
  if (value === null) {
    return {
      type: "null"
    };
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      firstItemType:
        value.length > 0
          ? Array.isArray(value[0])
            ? "array"
            : typeof value[0]
          : undefined
    };
  }

  if (typeof value !== "object") {
    return {
      type: typeof value,
      valuePreview: String(value).slice(0, 200)
    };
  }

  const candidate = value as Record<string, unknown>;

  return {
    type: "object",
    keys: Object.keys(candidate).slice(0, 30),

    lessonIdType: typeof candidate.lessonId,
    lessonFormatType:
      typeof candidate.lesson_format !== "undefined"
        ? typeof candidate.lesson_format
        : typeof candidate.lessonFormat,

    instructionalContextType:
      candidate.instructionalContext === null
        ? "null"
        : Array.isArray(candidate.instructionalContext)
          ? "array"
          : typeof candidate.instructionalContext,

    evidenceCardsType: Array.isArray(candidate.evidenceCards)
      ? "array"
      : candidate.evidenceCards === null
        ? "null"
        : typeof candidate.evidenceCards,

    evidenceCardsCount: Array.isArray(candidate.evidenceCards)
      ? candidate.evidenceCards.length
      : undefined,

    skippedCategoriesType: Array.isArray(candidate.skippedCategories)
      ? "array"
      : candidate.skippedCategories === null
        ? "null"
        : typeof candidate.skippedCategories,

    skippedCategoriesCount: Array.isArray(candidate.skippedCategories)
      ? candidate.skippedCategories.length
      : undefined,

    generationSummaryType:
      candidate.generationSummary === null
        ? "null"
        : Array.isArray(candidate.generationSummary)
          ? "array"
          : typeof candidate.generationSummary
  };
}
