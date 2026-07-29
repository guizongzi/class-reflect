from class_reflect_api.domain.transcript import LessonSection, TranscriptSegment


def build_lesson_sections(segments: list[TranscriptSegment]) -> list[LessonSection]:
    if not segments:
        return []

    sections: list[LessonSection] = []
    current: list[TranscriptSegment] = []
    current_start = segments[0].start_ms
    current_text_length = 0

    for segment in segments:
        previous = current[-1] if current else None
        duration = segment.end_ms - current_start
        gap_ms = segment.start_ms - previous.end_ms if previous else 0
        next_text_length = current_text_length + len(segment.original_text or "")
        should_close = bool(
            current
            and (
                duration >= 5 * 60 * 1000
                or gap_ms >= 20 * 1000
                or (
                    duration >= 90 * 1000
                    and next_text_length >= 900
                    and _is_likely_activity_boundary(previous.original_text if previous else "")
                )
            )
        )

        if should_close:
            sections.append(_make_section(current, len(sections)))
            current = []
            current_start = segment.start_ms
            current_text_length = 0

        current.append(segment)
        current_text_length += len(segment.original_text or "")

    if current:
        sections.append(_make_section(current, len(sections)))
    return sections


def _make_section(segments: list[TranscriptSegment], index: int) -> LessonSection:
    text = _format_section_transcript(segments)
    return LessonSection(
        start_ms=segments[0].start_ms,
        end_ms=segments[-1].end_ms,
        title=_infer_section_title(text, index),
        summary_text=text,
        confidence_label="需要复核",
        tags=_infer_section_tags(text),
    )


def _format_section_transcript(segments: list[TranscriptSegment]) -> str:
    paragraphs: list[str] = []
    current: list[TranscriptSegment] = []

    for segment in segments:
        previous = current[-1] if current else None
        gap_ms = segment.start_ms - previous.end_ms if previous else 0
        current_length = sum(len(item.original_text or "") for item in current)
        starts_new = bool(
            current
            and (
                gap_ms >= 12 * 1000
                or current_length >= 420
                or _is_likely_activity_boundary(previous.original_text if previous else "")
            )
        )
        if starts_new:
            paragraphs.append(_format_paragraph(current))
            current = []
        current.append(segment)

    if current:
        paragraphs.append(_format_paragraph(current))
    return "\n\n".join(paragraphs)


def _format_paragraph(segments: list[TranscriptSegment]) -> str:
    lines: list[str] = []
    for index, segment in enumerate(segments):
        previous = segments[index - 1] if index else None
        gap_ms = segment.start_ms - previous.end_ms if previous else 0
        pause_hint = f" 停顿{gap_ms / 1000:.1f}秒后" if gap_ms >= 3000 else ""
        lines.append(
            f"{_clock(segment.start_ms)}-{_clock(segment.end_ms)}{pause_hint} "
            f"{segment.speaker_label or '未知'}：{segment.original_text.strip()}"
        )
    return "\n".join(lines)


def _infer_section_title(text: str, index: int) -> str:
    if any(word in text for word in ["导入", "今天", "复习", "上节课", "回顾"]):
        return "导入与复习"
    if any(word in text for word in ["例题", "讲解", "概念", "表示", "叫作", "意义"]):
        return "概念讲解"
    if any(word in text for word in ["练习", "判断", "回答", "谁来说"]):
        return "课堂练习"
    if any(word in text for word in ["讨论", "小组", "同桌", "交流"]):
        return "讨论交流"
    if any(word in text for word in ["总结", "下节课", "作业", "今天学"]):
        return "总结与作业"
    if any(word in text for word in ["为什么", "几分之几", "问题", "想一想", "请问"]):
        return "提问与思考"
    return f"课堂片段 {index + 1}"


def _infer_section_tags(text: str) -> list[str]:
    tags: list[str] = []
    if any(word in text for word in ["？", "?", "为什么", "想一想", "请问"]):
        tags.append("含提问")
    if any(word in text for word in ["练习", "判断", "作业"]):
        tags.append("练习")
    if any(word in text for word in ["讨论", "同桌", "小组"]):
        tags.append("互动")
    return tags


def _is_likely_activity_boundary(text: str) -> bool:
    return any(
        word in text
        for word in ["接下来", "下面", "现在", "好，", "好,", "我们来看", "请大家", "开始练习", "小组讨论", "总结一下", "下一个"]
    )


def _clock(ms: int) -> str:
    total_seconds = max(0, ms // 1000)
    return f"{total_seconds // 60:02d}:{total_seconds % 60:02d}"

