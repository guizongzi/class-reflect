from dataclasses import dataclass


@dataclass(frozen=True)
class TranscriptSegment:
    start_ms: int
    end_ms: int
    speaker_label: str
    original_text: str
    translated_text: str | None = None
    confidence: float | None = None


@dataclass(frozen=True)
class LessonSection:
    start_ms: int
    end_ms: int
    title: str
    summary_text: str
    confidence_label: str
    tags: list[str]

