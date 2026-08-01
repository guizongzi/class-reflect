"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { lessonFormatOptions, type LessonFormat } from "@class-reflect/shared-types";

type Props = {
  lessonId?: string;
};

type UploadUrlResponse = {
  videoId: string;
  lessonId: string;
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
};

type UploadStep = "idle" | "creating" | "uploading" | "completed" | "failed";

type WorkflowStepItem = {
  stepKey: string;
  label: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

type WorkflowStatusResponse = {
  task: {
    status: string;
    currentStep?: string | null;
    progress?: number | null;
    errorMessage?: string | null;
  } | null;
  steps: WorkflowStepItem[];
};

type LessonTextItem = {
  id: string;
  targetType: "section" | "segment";
  startMs: number;
  endMs: number;
  title: string;
  originalText: string;
  translatedText: string | null;
  speakerLabel?: string | null;
  confidence?: number | null;
  sentences?: LessonTextItem[];
};

type LessonVideoItem = {
  id: string;
  fileName?: string | null;
  uploadStatus?: string | null;
  playbackUrl?: string | null;
  playbackError?: string | null;
  playbackUrlExpiresInSeconds?: number | null;
};

type LessonDetailResponse = {
  lesson?: {
    lessonFormat?: LessonFormat | null;
  };
  videos?: LessonVideoItem[];
  sections?: Array<Record<string, unknown>>;
  transcriptSegments?: Array<Record<string, unknown>>;
  evidenceCards?: EvidenceCardItem[];
  reports?: ReportItem[];
};

type TranslateResponse = {
  translation?: {
    id: string;
    targetType: "section" | "segment";
    translatedText: string | null;
  } | null;
};

type EvidenceCardItem = {
  id: string;
  category?: string;
  sentiment?: "positive" | "neutral" | "negative";
  title?: string;
  fact?: string;
  interpretation?: string;
  suggestion?: string;
  teacherView?: {
    title?: string;
    observation?: string;
    teachingMeaning?: string;
    nextStep?: string;
    exampleWording?: string;
  } | null;
  startMs?: number;
  endMs?: number;
  quote?: string;
  confidence?: string;
  reviewStatus?: string;
  uncertaintyNote?: string | null;
};

type ReportItem = {
  id: string;
  markdownContent: string;
  createdAt?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const progressStageLabels = ["对话发起", "处理过程", "校订原文", "核对证据", "人工复核", "生成报告"];
const workflowStageStepGroups: Record<number, string[]> = {
  0: ["create_lesson", "upload_video", "upload_audio"],
  1: ["upload_video", "upload_audio", "probe_media", "submit_asr", "poll_asr", "persist_transcript"],
  2: ["normalize_transcript", "build_sections"],
  3: ["calculate_metrics", "detect_events", "generate_evidence", "validate_evidence"],
  4: ["wait_human_review"],
  5: ["generate_report", "export_report"]
};

export function LessonWorkspaceShell({ lessonId }: Props) {
  const [activeLessonId, setActiveLessonId] = useState(lessonId || "");
  const [lessonFormat, setLessonFormat] = useState<LessonFormat | "">("");
  const [savedLessonFormat, setSavedLessonFormat] = useState<LessonFormat | "">("");
  const [savingLessonFormat, setSavingLessonFormat] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<UploadStep>("idle");
  const [videoProgress, setVideoProgress] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("请选择或拖入课堂视频。");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusResponse | null>(null);
  const [isWorkflowRefreshing, setIsWorkflowRefreshing] = useState(false);
  const [workflowAction, setWorkflowAction] = useState<string | null>(null);
  const [pendingRetryStepKey, setPendingRetryStepKey] = useState<string | null>(null);
  const [detailRefreshNonce, setDetailRefreshNonce] = useState(0);
  const [selectedProgressStageIndex, setSelectedProgressStageIndex] = useState<number | null>(null);
  const [lessonTexts, setLessonTexts] = useState<LessonTextItem[]>([]);
  const [activeTranscriptId, setActiveTranscriptId] = useState<string | null>(null);
  const [videoCurrentMs, setVideoCurrentMs] = useState(0);
  const [editingTextById, setEditingTextById] = useState<Record<string, string>>({});
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [evidenceCards, setEvidenceCards] = useState<EvidenceCardItem[]>([]);
  const [reviewingEvidenceId, setReviewingEvidenceId] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportDraft, setReportDraft] = useState("");
  const [savingReport, setSavingReport] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "你可以直接问我：这节课现在处理到哪了、哪些证据值得先看、报告可以怎么改。"
    }
  ]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const contentRefreshSignatureRef = useRef("");

  useEffect(() => {
    setActiveLessonId(lessonId || "");
    contentRefreshSignatureRef.current = "";
  }, [lessonId]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!activeLessonId) return;
    let cancelled = false;
    async function loadLessonDetail() {
      try {
        const detail = await getJson<LessonDetailResponse>(`/api/lessons/${activeLessonId}`);
        if (!cancelled) {
          if (detail.lesson?.lessonFormat && isLessonFormat(detail.lesson.lessonFormat)) {
            setLessonFormat(detail.lesson.lessonFormat);
            setSavedLessonFormat(detail.lesson.lessonFormat);
          }
          const playableVideo = detail.videos?.find((video) => video.playbackUrl) || null;
          const uploadedVideo = detail.videos?.find((video) => video.uploadStatus === "uploaded") || null;
          if (playableVideo?.playbackUrl) {
            if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(playableVideo.playbackUrl);
            setSelectedFileName(playableVideo.fileName || "已上传视频");
            setVideoProgress(100);
            setStatusMessage("已加载云端视频，可直接播放。");
          } else if (uploadedVideo) {
            setSelectedFileName(uploadedVideo.fileName || "已上传视频");
            setVideoProgress(100);
            setStatusMessage(uploadedVideo.playbackError || "视频已上传，但暂时无法生成播放链接。");
          }
          const textItems = buildLessonTextItems(detail);
          setLessonTexts(textItems);
          setEditingTextById(Object.fromEntries(flattenLessonTextItems(textItems).map((item) => [item.id, item.originalText])));
          setEvidenceCards(normalizeEvidenceCards(detail.evidenceCards));
          const loadedReports = normalizeReports(detail.reports);
          setReports(loadedReports);
          setReportDraft(loadedReports[0]?.markdownContent || "");
        }
      } catch {
        if (!cancelled) setLessonTexts([]);
      }
    }
    async function loadWorkflowStatus() {
      setIsWorkflowRefreshing(true);
      try {
        const response = await getJson<WorkflowStatusResponse>(`/api/lessons/${activeLessonId}/status`);
        if (!cancelled) setWorkflowStatus(response);
      } catch {
        if (!cancelled) setWorkflowStatus(null);
      } finally {
        if (!cancelled) setIsWorkflowRefreshing(false);
      }
    }
    void loadLessonDetail();
    void loadWorkflowStatus();
    const timer = window.setInterval(loadWorkflowStatus, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeLessonId, detailRefreshNonce]);

  useEffect(() => {
    if (!activeLessonId || !workflowStatus?.steps?.length) return;
    const contentStepKeys = new Set([
      "persist_transcript",
      "normalize_transcript",
      "build_sections",
      "calculate_metrics",
      "detect_events",
      "generate_evidence",
      "validate_evidence",
      "generate_report",
      "export_report"
    ]);
    const signature = workflowStatus.steps
      .filter((item) => contentStepKeys.has(item.stepKey))
      .map((item) => `${item.stepKey}:${item.status}:${item.finishedAt || ""}`)
      .join("|");
    const hasNewContent = workflowStatus.steps.some((item) => contentStepKeys.has(item.stepKey) && item.status === "completed");
    if (!hasNewContent || !signature || contentRefreshSignatureRef.current === signature) return;
    contentRefreshSignatureRef.current = signature;
    setDetailRefreshNonce((value) => value + 1);
  }, [activeLessonId, workflowStatus]);

  async function translateTextItem(item: LessonTextItem, force = false) {
    if (!activeLessonId) return;
    setTranslatingId(item.id);
    setTranslationError(null);
    try {
      const result = await postJson<TranslateResponse>(`/api/lessons/${activeLessonId}/translate`, {
        targetType: item.targetType,
        targetId: item.id,
        sourceLanguage: "en",
        targetLanguage: "zh-CN",
        force
      });
      const translatedText = result.translation?.translatedText || "";
      setLessonTexts((items) => items.map((current) => (
        current.id === item.id ? { ...current, translatedText } : current
      )));
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : "翻译失败");
    } finally {
      setTranslatingId(null);
    }
  }

  async function saveLessonText(item: LessonTextItem) {
    if (!activeLessonId) return;
    const editedSummaryText = editingTextById[item.id] || item.originalText;
    setSavingSectionId(item.id);
    setTranslationError(null);
    try {
      const targetPath = item.targetType === "section" ? "sections" : "segments";
      const result = await patchJson<{
        section?: { summaryText?: string };
        segment?: { text?: string; originalText?: string };
      }>(`/api/lessons/${activeLessonId}/transcripts/${targetPath}/${item.id}`, {
        editedSummaryText
      });
      const savedText = result.section?.summaryText || result.segment?.text || result.segment?.originalText || editedSummaryText;
      setLessonTexts((items) => items.map((current) => {
        if (current.id === item.id) return { ...current, originalText: savedText };
        if (!current.sentences?.length) return current;
        return {
          ...current,
          sentences: current.sentences.map((sentence) => sentence.id === item.id ? { ...sentence, originalText: savedText } : sentence)
        };
      }));
      setEditingTextById((drafts) => ({ ...drafts, [item.id]: savedText }));
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : "保存校订失败");
    } finally {
      setSavingSectionId(null);
    }
  }

  async function reviewEvidence(card: EvidenceCardItem, status: "accepted" | "edited_and_accepted" | "rejected" | "needs_more_context") {
    if (!activeLessonId) return;
    setReviewingEvidenceId(card.id);
    try {
      await patchJson(`/api/lessons/${activeLessonId}/evidence/${card.id}/review`, {
        status,
        finalFact: card.fact,
        finalJudgment: card.interpretation,
        finalSuggestion: card.suggestion
      });
      setEvidenceCards((cards) => cards.filter((item) => item.id !== card.id));
      const result = await getJson<{ evidenceCards: EvidenceCardItem[] }>(`/api/lessons/${activeLessonId}/evidence`);
      setEvidenceCards(normalizeEvidenceCards(result.evidenceCards || []));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "证据复核失败");
    } finally {
      setReviewingEvidenceId(null);
    }
  }

  async function generateReport() {
    if (!activeLessonId) return;
    setSavingReport(true);
    try {
      const result = await postJson<{ report: ReportItem }>(`/api/lessons/${activeLessonId}/reports`, {});
      setReports((items) => [result.report, ...items.filter((item) => item.id !== result.report.id)]);
      setReportDraft(result.report.markdownContent || "");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "报告生成失败");
    } finally {
      setSavingReport(false);
    }
  }

  async function cancelWorkflow() {
    if (!activeLessonId) return;
    setWorkflowAction("cancel");
    setErrorMessage(null);
    try {
      const status = await postJson<WorkflowStatusResponse>(`/api/lessons/${activeLessonId}/status/cancel`, {});
      setWorkflowStatus(status);
      setStatusMessage("已停止处理。可以从处理卡片中选择步骤重试。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "停止处理失败");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function retryWorkflow(fromStepKey?: string) {
    if (!activeLessonId) return;
    const actionKey = fromStepKey ? `retry-${fromStepKey}` : "retry";
    setPendingRetryStepKey(null);
    setWorkflowAction(actionKey);
    setErrorMessage(null);
    try {
      const status = await postJson<WorkflowStatusResponse>(`/api/lessons/${activeLessonId}/status/retry`, { fromStepKey });
      setWorkflowStatus(status);
      setDetailRefreshNonce((value) => value + 1);
      setStatusMessage(fromStepKey ? "已从选中步骤重新开始处理。" : "已重新开始处理。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "重试处理失败");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function confirmTranscriptReview() {
    if (!activeLessonId) return;
    setWorkflowAction("confirm-transcript");
    setErrorMessage(null);
    try {
      const status = await postJson<WorkflowStatusResponse>(`/api/lessons/${activeLessonId}/status/confirm-transcript`, {});
      setWorkflowStatus(status);
      setSelectedProgressStageIndex(null);
      setStatusMessage("已确认校订完成，正在继续生成课堂分析。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "确认校订失败");
    } finally {
      setWorkflowAction(null);
    }
  }

  function requestWorkflowRetry(fromStepKey?: string) {
    if (!workflowStatus?.task) {
      void retryWorkflow(fromStepKey);
      return;
    }
    setPendingRetryStepKey(fromStepKey || visibleStageRetryStep);
  }

  async function saveReport() {
    if (!activeLessonId || !reports[0]) return;
    setSavingReport(true);
    try {
      const result = await patchJson<{ report: ReportItem }>(`/api/lessons/${activeLessonId}/reports/${reports[0].id}`, {
        markdownContent: reportDraft
      });
      setReports((items) => items.map((item) => item.id === result.report.id ? result.report : item));
      setReportDraft(result.report.markdownContent || "");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "报告保存失败");
    } finally {
      setSavingReport(false);
    }
  }

  function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setErrorMessage("请选择课堂视频文件。");
      return;
    }

    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    resetForNewUpload();
    setPendingFile(file);
    setSelectedFileName(file.name);
    setVideoProgress(0);
    setAudioProgress(0);
    setErrorMessage(null);
    setStep("idle");
    setStatusMessage("请选择课堂类型，然后开始上传。");
  }

  function resetForNewUpload() {
    setActiveLessonId("");
    setLessonFormat("");
    setSavedLessonFormat("");
    setWorkflowStatus(null);
    setWorkflowAction(null);
    setLessonTexts([]);
    setPendingRetryStepKey(null);
    setEditingTextById({});
    setEvidenceCards([]);
    setReports([]);
    setReportDraft("");
    setTranslationError(null);
    setReviewingEvidenceId(null);
    if (window.location.pathname !== "/lessons/new") {
      window.history.replaceState(null, "", "/lessons/new");
    }
  }

  async function startUpload() {
    if (!pendingFile) {
      setErrorMessage("请先选择课堂视频文件。");
      return;
    }
    if (!activeLessonId && !lessonFormat) {
      setErrorMessage("请先选择课堂类型。");
      return;
    }

    const file = pendingFile;
    const selectedLessonFormat = lessonFormat || "offline_classroom_recording";
    setStep("creating");
    setStatusMessage("正在创建课堂，并准备处理材料。");

    try {
      const isCreatingNewLesson = !activeLessonId;
      const ensuredLessonId = activeLessonId || await createLessonFromFile(file, selectedLessonFormat);
      if (activeLessonId) {
        await patchJson(`/api/lessons/${ensuredLessonId}`, { lessonFormat: selectedLessonFormat });
        setSavedLessonFormat(selectedLessonFormat);
      } else {
        setSavedLessonFormat(selectedLessonFormat);
      }
      setActiveLessonId(ensuredLessonId);
      if (isCreatingNewLesson) window.history.replaceState(null, "", `/lessons/${ensuredLessonId}`);

      const videoUpload = await postJson<UploadUrlResponse>(`/api/lessons/${ensuredLessonId}/videos/upload-url`, {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream"
      });

      setStep("uploading");
      setStatusMessage("正在保存视频，并准备课堂声音。");

      const videoPipeline = uploadBlobWithProgress({
        url: videoUpload.uploadUrl,
        blob: file,
        headers: videoUpload.headers,
        onProgress: setVideoProgress
      }).then(() => postJson(`/api/lessons/videos/${videoUpload.videoId}/complete-upload`, {}));

      const audioPipeline = extractAudioWav(file, setAudioProgress)
        .then(async (audioBlob) => {
          const audioUpload = await postJson<UploadUrlResponse>(`/api/lessons/videos/${videoUpload.videoId}/audio-upload-url`, {
            mimeType: "audio/wav"
          });
          await uploadBlobWithProgress({
            url: audioUpload.uploadUrl,
            blob: audioBlob,
            headers: audioUpload.headers,
            onProgress: (progress) => setAudioProgress(75 + progress * 0.25)
          });
          await postJson(`/api/lessons/videos/${videoUpload.videoId}/complete-audio-upload`, {});
        });

      await Promise.all([videoPipeline, audioPipeline]);
      setStep("completed");
      setPendingFile(null);
      setStatusMessage("视频已保存，课堂声音也准备好了，正在进入后续处理。");
      const latestStatus = await getJson<WorkflowStatusResponse>(`/api/lessons/${ensuredLessonId}/status`);
      setWorkflowStatus(latestStatus);
    } catch (error) {
      setStep("failed");
      setErrorMessage(error instanceof Error ? error.message : "上传失败");
      setStatusMessage("上传链路未完成，请检查配置后重试。");
    }
  }

  async function saveLessonFormat() {
    if (!activeLessonId || !lessonFormat) {
      setErrorMessage("请先选择课堂类型。");
      return;
    }
    setSavingLessonFormat(true);
    setErrorMessage(null);
    try {
      const result = await patchJson<{ lesson?: { lessonFormat?: LessonFormat | null } }>(`/api/lessons/${activeLessonId}`, {
        lessonFormat
      });
      const nextFormat = result.lesson?.lessonFormat && isLessonFormat(result.lesson.lessonFormat)
        ? result.lesson.lessonFormat
        : lessonFormat;
      setLessonFormat(nextFormat);
      setSavedLessonFormat(nextFormat);
      setStatusMessage("课堂类型已更新。后续重跑证据会按新的课堂类型分析。");
      setDetailRefreshNonce((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "课堂类型保存失败");
    } finally {
      setSavingLessonFormat(false);
    }
  }

  function sendChatMessage() {
    const message = chatInput.trim();
    if (!message) return;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message
    };
    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: buildChatReply(message, {
        evidenceCount: evidenceCards.length,
        lessonTextCount: lessonTexts.length,
        reportCount: reports.length,
        step,
        workflowSummary: workflowStatus ? formatWorkflowSummary(workflowStatus) : "等待上传"
      })
    };
    setChatMessages((messages) => [...messages, userMessage, assistantMessage]);
    setChatInput("");
  }

  const activeProgressStageIndex = getProgressStageIndex({
    uploadStep: step,
    workflowStatus
  });
  const visibleProgressStageIndex = selectedProgressStageIndex ?? activeProgressStageIndex;
  const displayWorkflowSteps = workflowStatus?.steps?.length
    ? workflowStatus.steps
    : buildUploadWorkflowSteps(step, videoProgress, audioProgress);
  const visibleWorkflowSteps = filterWorkflowStepsByStage(displayWorkflowSteps, visibleProgressStageIndex);
  const shouldShowLessonFormatCard = Boolean((pendingFile && !activeLessonId) || visibleProgressStageIndex === 0);
  const isLessonFormatDirty = Boolean(activeLessonId && lessonFormat && lessonFormat !== savedLessonFormat);
  const pendingEvidenceCards = evidenceCards.filter(isPendingEvidenceCard);
  const isWaitingForTranscriptConfirmation = Boolean(
    workflowStatus?.task?.status === "waiting_for_human" && workflowStatus.task.currentStep === "build_sections"
  );
  const transcriptDurationMs = getTranscriptDurationMs(lessonTexts);
  const activeTranscript = lessonTexts.find((item) => item.id === activeTranscriptId) || lessonTexts[0] || null;
  const visibleStageRetryStep = getRetryStartStepForStage(visibleProgressStageIndex);

  useEffect(() => {
    setSelectedProgressStageIndex(null);
  }, [activeProgressStageIndex]);

  useEffect(() => {
    if (!lessonTexts.length) {
      setActiveTranscriptId(null);
      return;
    }
    setActiveTranscriptId((current) => current && lessonTexts.some((item) => item.id === current) ? current : lessonTexts[0].id);
  }, [lessonTexts]);

  function jumpToEvidence(card: EvidenceCardItem) {
    const startSeconds = Math.max(0, (card.startMs || 0) / 1000);
    const video = videoRef.current;
    if (!video || !previewUrl) {
      setStatusMessage("视频还没有加载完成，暂时不能跳转到证据时间。");
      return;
    }
    video.currentTime = startSeconds;
    video.focus();
    void video.play().catch(() => undefined);
    setStatusMessage(`已跳到证据时间 ${formatTimestamp(startSeconds * 1000)}。`);
  }

  function jumpToTranscript(item: LessonTextItem) {
    const parentSection = findParentTranscriptSection(lessonTexts, item);
    if (parentSection) setActiveTranscriptId(parentSection.id);
    setVideoCurrentMs(item.startMs);
    const startSeconds = Math.max(0, item.startMs / 1000);
    const video = videoRef.current;
    if (!video || !previewUrl) {
      setStatusMessage("视频还没有加载完成，暂时不能跳转到逐字稿时间。");
      return;
    }
    video.currentTime = startSeconds;
    video.focus();
    void video.play().catch(() => undefined);
    setStatusMessage(`已跳到逐字稿时间 ${formatTimestamp(item.startMs)}。`);
  }

  function handleVideoTimeUpdate(currentSeconds: number) {
    const currentMs = Math.max(0, Math.round(currentSeconds * 1000));
    setVideoCurrentMs(currentMs);
    const currentSection = findTranscriptSectionAtMs(lessonTexts, currentMs);
    if (currentSection && currentSection.id !== activeTranscriptId) {
      setActiveTranscriptId(currentSection.id);
    }
  }

  function seekTranscriptTimeline(nextMs: number) {
    const clampedMs = Math.max(0, Math.min(nextMs, transcriptDurationMs || nextMs));
    setVideoCurrentMs(clampedMs);
    const currentSection = findTranscriptSectionAtMs(lessonTexts, clampedMs);
    if (currentSection) setActiveTranscriptId(currentSection.id);
    const video = videoRef.current;
    if (video && previewUrl) {
      video.currentTime = clampedMs / 1000;
      video.focus();
    }
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-main">
        <header className="topbar">
          <div className="topbar-title">
            <strong>AI课堂回放与教学分析</strong>
            <span>{lessonId ? `课堂 ${lessonId}` : "新建课堂复盘"}</span>
          </div>
          <div className="topbar-actions">
            <Link className="ghost-button" href="/lessons">视频库</Link>
            {lessonId ? <Link className="primary-button" href="/lessons/new">上传新视频</Link> : null}
          </div>
        </header>

        <section className="video-panel">
          <div
            className={`upload-dropzone ${isDragging ? "dragging" : ""} ${previewUrl ? "has-preview" : ""}`}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files.item(0);
              if (file) handleFile(file);
            }}
          >
            {previewUrl ? (
              <video
                className="video-preview"
                controls
                ref={videoRef}
                src={previewUrl}
                onLoadedMetadata={(event) => handleVideoTimeUpdate(event.currentTarget.currentTime)}
                onTimeUpdate={(event) => handleVideoTimeUpdate(event.currentTarget.currentTime)}
              />
            ) : (
              <div className="video-placeholder">
                <strong>拖入或选择课堂视频</strong>
                <span>上传后会自动准备课堂声音，用来生成原文和后续分析。</span>
              </div>
            )}
            <div className="upload-toolbar">
              <div>
                <strong>{selectedFileName || "尚未选择视频"}</strong>
                <span>{statusMessage}</span>
              </div>
              <button className="primary-button" onClick={() => fileInputRef.current?.click()} type="button">
                {selectedFileName ? "重新选择" : "选择课堂视频"}
              </button>
              <input
                accept="video/*"
                ref={fileInputRef}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </div>
            <div className="upload-progress-grid">
              <ProgressItem label="原始视频上传" progress={videoProgress} />
              <ProgressItem label="浏览器生成音频并上传" progress={audioProgress} />
            </div>
            {errorMessage ? <div className="error-banner compact">{errorMessage}</div> : null}
          </div>
        </section>

        <section className="transcript-panel">
          <div className="panel-heading-row">
            <h2>课堂记录</h2>
            <span>{lessonTexts.length ? `${lessonTexts.length} 段` : "等待转写"}</span>
          </div>
          {translationError ? <div className="error-banner compact">{translationError}</div> : null}
          <div className="transcript-list">
            {lessonTexts.length && activeTranscript ? (
              <>
                <TranscriptTimeline
                  activeId={activeTranscript.id}
                  currentMs={videoCurrentMs}
                  durationMs={transcriptDurationMs}
                  items={lessonTexts}
                  onSeek={seekTranscriptTimeline}
                  onSelect={(item) => jumpToTranscript(item)}
                />
                <TranscriptEditor
                  editingTextById={editingTextById}
                  item={activeTranscript}
                  savingSectionId={savingSectionId}
                  translatingId={translatingId}
                  onJump={jumpToTranscript}
                  onSave={(item) => void saveLessonText(item)}
                  onTextChange={(id, text) => setEditingTextById((drafts) => ({ ...drafts, [id]: text }))}
                  onTranslate={(item) => void translateTextItem(item, Boolean(item.translatedText))}
                />
              </>
            ) : (
              <div className="empty-row">
                <strong>暂无课堂记录</strong>
                <span>生成并整理好课堂原文后，这里会显示可拖动的分段时间轴。</span>
              </div>
            )}
          </div>
        </section>
      </section>

      <aside className="assistant-panel">
        <div className="progress-line">
          {progressStageLabels.map((stageLabel, index) => (
            <button
              className={`${index <= activeProgressStageIndex ? "active" : ""} ${index === visibleProgressStageIndex ? "selected" : ""}`}
              key={stageLabel}
              onClick={() => setSelectedProgressStageIndex(index)}
              type="button"
            >
              {stageLabel}
            </button>
          ))}
        </div>
        {shouldShowLessonFormatCard ? (
        <section className="assistant-card">
          <h2>AI 任务助手</h2>
          <p>{buildAssistantMessage(step)}</p>
          <div className="assistant-format-block">
            <div className="assistant-card-title">
              <strong>课堂类型</strong>
              <span>{lessonFormat ? lessonFormatOptions.find((option) => option.value === lessonFormat)?.label : "必选"}</span>
            </div>
            <div className="format-grid compact">
              {lessonFormatOptions.map((option) => (
                <button
                  className={`format-card ${lessonFormat === option.value ? "selected" : ""}`}
                  key={option.value}
                  onClick={() => setLessonFormat(option.value)}
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
            {activeLessonId ? (
              <div className="assistant-inline-actions">
                <button
                  className="primary-button compact-button"
                  disabled={!lessonFormat || savingLessonFormat || !isLessonFormatDirty}
                  onClick={() => void saveLessonFormat()}
                  type="button"
                >
                  {savingLessonFormat ? "保存中" : isLessonFormatDirty ? "保存课堂类型" : "类型已保存"}
                </button>
              </div>
            ) : null}
          </div>
          <button className="ghost-button" onClick={() => fileInputRef.current?.click()} type="button">
            {selectedFileName ? "重新选择视频" : "选择课堂视频"}
          </button>
          {pendingFile ? (
            <button
              className="primary-button"
              disabled={!lessonFormat || ["creating", "uploading"].includes(step)}
              onClick={() => void startUpload()}
              type="button"
            >
              {lessonFormat ? "确认并开始上传" : "先选择课堂类型"}
            </button>
          ) : null}
        </section>
        ) : null}
        <section className="assistant-card muted">
          <div className="assistant-card-title">
            <strong>{progressStageLabels[visibleProgressStageIndex]}进度</strong>
            <span>{isWorkflowRefreshing ? "刷新中" : formatWorkflowSummary(workflowStatus)}</span>
          </div>
          {activeLessonId ? (
            <div className="workflow-card-toolbar">
              <button
                className="ghost-button compact-button"
                disabled={workflowAction === `retry-${visibleStageRetryStep}` || workflowAction === "retry"}
                onClick={() => requestWorkflowRetry(visibleStageRetryStep)}
                type="button"
              >
                {workflowAction === `retry-${visibleStageRetryStep}` || workflowAction === "retry" ? "处理中" : workflowStatus?.task ? "从本阶段重试" : "开始处理"}
              </button>
              {workflowStatus?.task ? (
                <button
                  className="danger-button compact-button"
                  disabled={workflowAction === "cancel" || ["completed", "cancelled"].includes(workflowStatus.task.status)}
                  onClick={() => void cancelWorkflow()}
                  type="button"
                >
                  {workflowAction === "cancel" ? "停止中" : "停止"}
                </button>
              ) : null}
            </div>
          ) : null}
          {pendingRetryStepKey ? (
            <div className="retry-confirm-card">
              <strong>确认从「{getWorkflowStepLabel(pendingRetryStepKey, displayWorkflowSteps)}」重新处理？</strong>
              <span>{buildRetryImpactMessage(pendingRetryStepKey)}</span>
              <div>
                <button className="primary-button compact-button" onClick={() => void retryWorkflow(pendingRetryStepKey)} type="button">
                  确认重跑
                </button>
                <button className="ghost-button compact-button" onClick={() => setPendingRetryStepKey(null)} type="button">
                  取消
                </button>
              </div>
            </div>
          ) : null}
            <WorkflowStepList
              steps={visibleWorkflowSteps}
              task={workflowStatus?.task || null}
              workflowAction={workflowAction}
              onRetry={activeLessonId ? requestWorkflowRetry : undefined}
            />
          {isWaitingForTranscriptConfirmation && visibleProgressStageIndex === 2 ? (
            <div className="review-confirm-card">
              <strong>校订完成了吗？</strong>
              <span>确认后会继续生成课堂分析和待核对证据；还想改原文的话，可以先在左侧保存修改。</span>
              <button
                className="primary-button compact-button"
                disabled={workflowAction === "confirm-transcript"}
                onClick={() => void confirmTranscriptReview()}
                type="button"
              >
                {workflowAction === "confirm-transcript" ? "确认中" : "确认校订完成"}
              </button>
            </div>
          ) : null}
        </section>
        <section className="assistant-card muted ai-chat-card">
          <div className="assistant-card-title">
            <strong>AI 对话</strong>
            <span>{activeLessonId ? "围绕当前课堂" : "等待课堂创建"}</span>
          </div>
          <div className="chat-message-list">
            {chatMessages.map((message) => (
              <div className={`chat-message ${message.role}`} key={message.id}>
                <span>{message.role === "assistant" ? "AI" : "我"}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
          <form
            className="chat-input-row"
            onSubmit={(event) => {
              event.preventDefault();
              sendChatMessage();
            }}
          >
            <textarea
              aria-label="和 AI 对话"
              placeholder="问问这节课的证据、转写或报告..."
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendChatMessage();
                }
              }}
            />
            <button className="primary-button compact-button" disabled={!chatInput.trim()} type="submit">
              发送
            </button>
          </form>
        </section>
        <section className="assistant-card muted">
          <div className="assistant-card-title">
            <strong>证据审核</strong>
            <span>{pendingEvidenceCards.length ? `${pendingEvidenceCards.length} 张待处理` : "已处理完"}</span>
          </div>
          <div className="evidence-list">
            {pendingEvidenceCards.length ? pendingEvidenceCards.map((card) => (
              <article className="evidence-card" key={card.id}>
                <div>
                  <strong>{formatEvidenceTitle(card)}</strong>
                  <span>{formatEvidenceTone(card)} · {formatTimeRange(card.startMs || 0, card.endMs || 0)} · {formatReviewStatus(card.reviewStatus)}</span>
                </div>
                <p>{card.teacherView?.observation || card.fact || card.quote}</p>
                {card.teacherView?.teachingMeaning ? <small>{card.teacherView.teachingMeaning}</small> : null}
                {card.teacherView?.nextStep ? <em>{card.teacherView.nextStep}</em> : null}
                {card.teacherView?.exampleWording ? <small>示例：{card.teacherView.exampleWording}</small> : null}
                {card.quote && card.quote !== card.fact ? <small>原文：{card.quote}</small> : null}
                <div className="evidence-actions">
                  <button className="ghost-button compact-button" onClick={() => jumpToEvidence(card)} type="button">跳到视频</button>
                  <button className="ghost-button compact-button" disabled={reviewingEvidenceId === card.id} onClick={() => void reviewEvidence(card, "accepted")} type="button">接受</button>
                  <button className="ghost-button compact-button" disabled={reviewingEvidenceId === card.id} onClick={() => void reviewEvidence(card, "needs_more_context")} type="button">需更多上下文</button>
                  <button className="danger-button compact-button" disabled={reviewingEvidenceId === card.id} onClick={() => void reviewEvidence(card, "rejected")} type="button">驳回</button>
                </div>
              </article>
            )) : <span>当前没有待复核证据。</span>}
          </div>
        </section>
        <section className="assistant-card muted">
          <div className="assistant-card-title">
            <strong>报告</strong>
            <span>{reports.length ? "已有报告" : "未生成"}</span>
          </div>
          <button className="primary-button" disabled={savingReport} onClick={() => void generateReport()} type="button">
            {savingReport ? "处理中" : "生成报告"}
          </button>
          {reportDraft ? (
            <>
              <textarea
                className="report-editor"
                aria-label="报告 Markdown"
                value={reportDraft}
                onChange={(event) => setReportDraft(event.target.value)}
              />
              <button className="ghost-button" disabled={savingReport || !reports[0]} onClick={() => void saveReport()} type="button">
                保存报告
              </button>
            </>
          ) : null}
        </section>
      </aside>
    </main>
  );
}

function ProgressItem({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="progress-card">
      <div>
        <span>{label}</span>
        <b>{Math.round(progress)}%</b>
      </div>
      <progress max={100} value={progress} />
    </div>
  );
}

function TranscriptTimeline({
  activeId,
  currentMs,
  durationMs,
  items,
  onSeek,
  onSelect
}: {
  activeId: string;
  currentMs: number;
  durationMs: number;
  items: LessonTextItem[];
  onSeek: (ms: number) => void;
  onSelect: (item: LessonTextItem) => void;
}) {
  const maxMs = Math.max(durationMs, 1000);
  const currentItem = items.find((item) => item.id === activeId) || items[0];
  return (
    <div className="transcript-timeline">
      <div className="timeline-header">
        <strong>{currentItem.title}</strong>
        <span>{formatTimeRange(currentItem.startMs, currentItem.endMs)}</span>
      </div>
      <div className="timeline-control">
        <div className="timeline-segments">
          {items.map((item) => {
            const left = Math.max(0, Math.min(100, (item.startMs / maxMs) * 100));
            const width = Math.max(1.2, Math.min(100 - left, ((item.endMs - item.startMs) / maxMs) * 100));
            return (
              <button
                className={`timeline-segment ${item.id === activeId ? "active" : ""}`}
                key={item.id}
                onClick={() => onSelect(item)}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${item.title} ${formatTimeRange(item.startMs, item.endMs)}`}
                type="button"
              />
            );
          })}
        </div>
        <input
          aria-label="课堂记录时间轴"
          className="timeline-range"
          max={maxMs}
          min={0}
          step={500}
          type="range"
          value={Math.min(currentMs, maxMs)}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
        />
      </div>
      <div className="timeline-footer">
        <span>{formatTimestamp(currentMs)}</span>
        <span>{formatTimestamp(maxMs)}</span>
      </div>
    </div>
  );
}

function TranscriptEditor({
  editingTextById,
  item,
  savingSectionId,
  translatingId,
  onJump,
  onSave,
  onTextChange,
  onTranslate
}: {
  editingTextById: Record<string, string>;
  item: LessonTextItem;
  savingSectionId: string | null;
  translatingId: string | null;
  onJump: (item: LessonTextItem) => void;
  onSave: (item: LessonTextItem) => void;
  onTextChange: (id: string, text: string) => void;
  onTranslate: (item: LessonTextItem) => void;
}) {
  return (
    <article className="transcript-item active-transcript-item">
      <button className="transcript-body" onClick={() => onJump(item)} type="button">
        <div>
          <strong>{item.title}</strong>
          <span>{formatTimeRange(item.startMs, item.endMs)}</span>
        </div>
        <p>{item.originalText || "这一段还没有整理后的摘要，可直接校订下面的逐句文本。"}</p>
        {item.translatedText ? <em>{item.translatedText}</em> : null}
      </button>
      {item.sentences?.length ? (
        <div className="transcript-sentence-list compact">
          {item.sentences.map((sentence) => (
            <div className="transcript-sentence" key={sentence.id}>
              <button className="sentence-time" onClick={() => onJump(sentence)} type="button">
                {formatTimestamp(sentence.startMs)}
              </button>
              <span className="speaker-chip">{sentence.speakerLabel || "未知"}</span>
              <textarea
                aria-label="校订逐字稿句子"
                value={editingTextById[sentence.id] ?? sentence.originalText}
                onChange={(event) => onTextChange(sentence.id, event.target.value)}
              />
              <button
                className="ghost-button compact-button"
                disabled={savingSectionId === sentence.id}
                onClick={() => onSave(sentence)}
                type="button"
              >
                {savingSectionId === sentence.id ? "保存中" : "保存"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="transcript-actions">
          <textarea
            aria-label="校订课堂记录"
            value={editingTextById[item.id] ?? item.originalText}
            onChange={(event) => onTextChange(item.id, event.target.value)}
          />
          <div>
            <button
              className="ghost-button compact-button"
              disabled={savingSectionId === item.id}
              onClick={() => onSave(item)}
              type="button"
            >
              {savingSectionId === item.id ? "保存中" : "保存校订"}
            </button>
            <button
              className="ghost-button compact-button"
              disabled={translatingId === item.id}
              onClick={() => onTranslate(item)}
              type="button"
            >
              {translatingId === item.id ? "翻译中" : item.translatedText ? "重新翻译" : "英译中"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function buildUploadWorkflowSteps(step: UploadStep, videoProgress: number, audioProgress: number): WorkflowStepItem[] {
  const createStatus = step === "idle" ? "waiting" : "completed";
  const uploadStatus = step === "uploading" ? "running" : step === "completed" ? "completed" : step === "failed" ? "failed" : "waiting";
  return [
    {
      stepKey: "create_lesson",
      label: "创建课堂",
      status: createStatus,
      progress: createStatus === "completed" ? 100 : 0
    },
    {
      stepKey: "upload_video",
      label: "保存课堂视频",
      status: videoProgress >= 100 ? "completed" : uploadStatus,
      progress: videoProgress
    },
    {
      stepKey: "upload_audio",
      label: "准备课堂声音",
      status: audioProgress >= 100 ? "completed" : uploadStatus,
      progress: audioProgress
    }
  ];
}

function filterWorkflowStepsByStage(steps: WorkflowStepItem[], stageIndex: number) {
  const stepKeys = workflowStageStepGroups[stageIndex] || [];
  if (!stepKeys.length) return [];
  const byKey = new Map(steps.map((step) => [step.stepKey, step]));
  return stepKeys.map((stepKey) => byKey.get(stepKey)).filter(Boolean) as WorkflowStepItem[];
}

function flattenLessonTextItems(items: LessonTextItem[]) {
  return items.flatMap((item) => [item, ...(item.sentences || [])]);
}

function getTranscriptDurationMs(items: LessonTextItem[]) {
  return Math.max(0, ...items.map((item) => item.endMs));
}

function findTranscriptSectionAtMs(items: LessonTextItem[], ms: number) {
  if (!items.length) return null;
  return items.find((item) => ms >= item.startMs && ms <= item.endMs)
    || items.find((item) => ms < item.startMs)
    || items[items.length - 1];
}

function findParentTranscriptSection(items: LessonTextItem[], target: LessonTextItem) {
  if (target.targetType === "section") return target;
  return items.find((item) => item.sentences?.some((sentence) => sentence.id === target.id))
    || findTranscriptSectionAtMs(items, target.startMs);
}

function buildLessonTextItems(detail: LessonDetailResponse): LessonTextItem[] {
  const sections = Array.isArray(detail.sections) ? detail.sections : [];
  const segments = Array.isArray(detail.transcriptSegments) ? detail.transcriptSegments.map((segment, index): LessonTextItem => ({
    id: stringValue(segment.id),
    targetType: "segment",
    startMs: numberValue(segment.start_ms ?? segment.startMs),
    endMs: numberValue(segment.end_ms ?? segment.endMs),
    title: `${stringValue(segment.speaker_label ?? segment.speakerLabel) || `句子 ${index + 1}`} · ${formatTimeRange(numberValue(segment.start_ms ?? segment.startMs), numberValue(segment.end_ms ?? segment.endMs))}`,
    originalText: stringValue(segment.original_text ?? segment.originalText ?? segment.text),
    translatedText: nullableString(segment.translated_text ?? segment.translatedText),
    speakerLabel: nullableString(segment.speaker_label ?? segment.speakerLabel),
    confidence: segment.confidence == null ? null : numberValue(segment.confidence)
  })).filter((item) => item.id && item.originalText) : [];
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
  const sectionItems = sections.map((section, index): LessonTextItem => {
    const startMs = numberValue(section.start_ms ?? section.startMs);
    const endMs = numberValue(section.end_ms ?? section.endMs);
    const sectionIds = arrayOfStrings(section.transcript_segment_ids ?? section.transcriptSegmentIds);
    const sectionSentences = sectionIds.length
      ? sectionIds.map((id) => segmentsById.get(id)).filter(Boolean) as LessonTextItem[]
      : segments.filter((segment) => segment.startMs >= startMs && segment.endMs <= endMs);
    return {
      id: stringValue(section.id),
      targetType: "section",
      startMs,
      endMs,
      title: normalizeTranscriptSectionTitle(stringValue(section.title), sectionSentences, index),
      originalText: stringValue(section.edited_summary_text ?? section.editedSummaryText ?? section.summary_text ?? section.summaryText),
      translatedText: nullableString(section.translated_summary_text ?? section.translatedSummaryText),
      sentences: sectionSentences
    };
  }).filter((item) => item.id && (item.originalText || item.sentences?.length))
    .sort((a, b) => a.startMs - b.startMs);
  return sectionItems.length ? sectionItems : segments.sort((a, b) => a.startMs - b.startMs);
}

function normalizeTranscriptSectionTitle(title: string, sentences: LessonTextItem[], index: number) {
  const trimmed = title.trim();
  if (trimmed && !/^课堂片段\s*\d+$/u.test(trimmed)) return trimmed;
  const text = normalizeTitleSource(sentences.map((sentence) => sentence.originalText).join(""));
  const activity = inferSectionActivityTitle(text, index);
  const keyword = inferSectionKeywordTitle(text);
  return keyword ? `${activity}：${keyword}` : activity;
}

function inferSectionActivityTitle(text: string, index: number) {
  if (/上节课|复习|回顾|今天.*(学习|来看|研究)|导入|先来看/.test(text)) return "导入与复习";
  if (/概念|意义|性质|定义|表示|叫作|是什么|怎么理解/.test(text)) return "概念讲解";
  if (/为什么|怎么|谁来说|谁能|请.*回答|想一想|哪.*相等|是不是|对不对/.test(text)) return "问题探究";
  if (/因为|所以|由此|可以得到|推出|说明|证明|理由|依据/.test(text)) return "推理说明";
  if (/方法|步骤|规律|可以用|一般|归纳|总结出|以后遇到/.test(text)) return "方法归纳";
  if (/练习|判断|算一算|写一写|完成|试一试|做一做|例题|题目/.test(text)) return "练习讲评";
  if (/同学们|请大家|打开|拿出|看屏幕|小组|讨论|坐好|安静/.test(text)) return "课堂组织";
  if (/总结|作业|下节课|今天学|回家|课后/.test(text)) return "总结与作业";
  return index === 0 ? "课堂导入" : "课堂推进";
}

function inferSectionKeywordTitle(text: string) {
  const patterns = [
    /([一二三四五六七八九十\d]+)\s*[、.．]?\s*([^。！？?，,；;]{2,16})/,
    /(分数的意义|分数单位|对数函数|函数图象|角平分线|三角形|等腰三角形|面积|方程|比例|小数|整数|百分数)/,
    /(图象和性质|图中的[^。！？?，,；;]{2,14}|这个方法|这种方法|这道题|这个问题|这两个角|这条线|这个答案)/,
    /(先[^。！？?，,；;]{2,14}|接下来[^。！？?，,；;]{2,14}|下面[^。！？?，,；;]{2,14})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = normalizeTitleSource(match?.[2] || match?.[1] || "");
    if (isMeaningfulSectionKeyword(value)) return trimSectionKeyword(value);
  }
  const phrase = text
    .split(/[。！？?，,；;\n]/)
    .map((item) => normalizeTitleSource(item))
    .find(isMeaningfulSectionKeyword);
  return phrase ? trimSectionKeyword(phrase) : "";
}

function normalizeTitleSource(text: string) {
  return text
    .replace(/\s+/g, "")
    .replace(/^(嗯|啊|呃|额|那个|这个|那么|那|好|哎)[，,、。]*/g, "")
    .trim();
}

function isMeaningfulSectionKeyword(value: string) {
  if (value.length < 2) return false;
  if (/^(老师|教师|学生|同学们|我们|大家|然后|接下来|首先|那么|那|这个|那个|就是|可以|看看|来说)$/.test(value)) return false;
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(value);
}

function trimSectionKeyword(value: string) {
  return value
    .replace(/^(我们|大家|同学们|先|再|来|看一下|来看|说一下|想一想|请你?)/, "")
    .replace(/[。！？?，,；;：:、]+$/g, "")
    .slice(0, 16);
}

function normalizeEvidenceCards(value: unknown): EvidenceCardItem[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    const raw = item.raw_json && typeof item.raw_json === "object" ? item.raw_json as Record<string, unknown> : {};
    const apiTeacherView = item.teacherView && typeof item.teacherView === "object" ? item.teacherView as EvidenceCardItem["teacherView"] : null;
    const rawTeacherView = raw.teacherView && typeof raw.teacherView === "object" ? raw.teacherView as EvidenceCardItem["teacherView"] : null;
    const teacherView = apiTeacherView || rawTeacherView;
    const conclusion = stringValue(item.edited_conclusion ?? item.conclusion);
    const [fallbackFact = conclusion, fallbackInterpretation = ""] = conclusion.split("\n");
    const category = stringValue(item.category ?? raw.category ?? item.evidence_type);
    return {
      id: stringValue(item.id ?? raw.id),
      category,
      sentiment: normalizeEvidenceSentiment(item.sentiment ?? raw.sentiment, category),
      title: stringValue(teacherView?.title ?? item.title ?? raw.title ?? category),
      fact: stringValue(item.fact ?? raw.fact ?? fallbackFact),
      interpretation: stringValue(item.interpretation ?? raw.interpretation ?? fallbackInterpretation),
      suggestion: stringValue(item.suggestion ?? raw.suggestion),
      teacherView,
      startMs: numberValue(item.startMs ?? item.start_ms ?? raw.startMs),
      endMs: numberValue(item.endMs ?? item.end_ms ?? raw.endMs),
      quote: stringValue(item.quote ?? item.quote_text ?? raw.quote),
      confidence: stringValue(item.confidence ?? item.confidence_label ?? raw.confidence),
      reviewStatus: stringValue(item.reviewStatus ?? item.review_status ?? raw.reviewStatus),
      uncertaintyNote: nullableString(item.uncertaintyNote ?? raw.uncertaintyNote)
    };
  }).filter((item) => item.id && isPendingEvidenceCard(item));
}

function normalizeEvidenceSentiment(value: unknown, category: string): EvidenceCardItem["sentiment"] {
  if (value === "positive" || value === "negative" || value === "neutral") return value;
  if (category === "response_pattern" || category === "learning_check_level") return "negative";
  if (["method_generalization", "variation_practice", "knowledge_connection", "structured_review", "error_analysis", "self_check"].includes(category)) {
    return "positive";
  }
  return "neutral";
}

function formatEvidenceTitle(card: EvidenceCardItem) {
  const rawTitle = stringValue(card.teacherView?.title || card.title).trim();
  if (rawTitle && rawTitle !== "教学证据") return rawTitle;
  return {
    response_pattern: "课堂提问与回应证据",
    learning_check_level: "学习检查方式证据",
    classroom_management: "课堂组织与任务切换证据",
    error_analysis: "错误原因分析证据",
    method_generalization: "方法归纳证据",
    variation_practice: "变式练习或迁移证据",
    knowledge_connection: "知识联系证据",
    structured_review: "结构化复习证据",
    technical_issue: "直播技术确认证据",
    self_check: "自测提示证据",
    lesson_summary: "课堂总结证据"
  }[card.category || ""] || "教学证据";
}

function isPendingEvidenceCard(card: EvidenceCardItem) {
  return !card.reviewStatus || card.reviewStatus === "pending_review";
}

function formatEvidenceTone(card: EvidenceCardItem) {
  return {
    positive: "亮点",
    neutral: "观察",
    negative: "可优化"
  }[card.sentiment || "neutral"];
}

function normalizeReports(value: unknown): ReportItem[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: stringValue(item.id),
      markdownContent: stringValue(item.markdown_content ?? item.markdownContent),
      createdAt: nullableString(item.created_at ?? item.createdAt) || undefined
    };
  }).filter((item) => item.id);
}

async function createLessonFromFile(file: File, lessonFormat: LessonFormat) {
  const lesson = await postJson<{ lesson: { id: string }; id?: string } | { id: string }>("/api/lessons", {
    lessonTitle: file.name.replace(/\.[^.]+$/, "") || "未命名课堂",
    courseTitle: "课堂复盘",
    lessonFormat
  });
  if ("id" in lesson && lesson.id) return lesson.id;
  if ("lesson" in lesson && lesson.lesson?.id) return lesson.lesson.id;
  throw new Error("课堂记录创建失败：响应中缺少课堂 ID");
}

async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "请求失败");
  }
  return payload as T;
}

async function patchJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "请求失败");
  }
  return payload as T;
}

async function getJson<T = unknown>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "请求失败");
  }
  return payload as T;
}

function uploadBlobWithProgress(input: {
  url: string;
  blob: Blob;
  headers?: Record<string, string>;
  onProgress: (progress: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.url);
    Object.entries(input.headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress((event.loaded / event.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`文件保存失败：HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("无法连接文件保存服务，请检查网络或上传配置。"));
    xhr.send(input.blob);
  });
}

async function extractAudioWav(file: File, onProgress?: (progress: number) => void) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("当前浏览器不支持前端音频提取。");
  }

  const audioContext = new AudioContextClass();
  try {
    onProgress?.(8);
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(25);
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    onProgress?.(60);
    const wav = audioBufferToMonoWav(decoded);
    onProgress?.(75);
    return wav;
  } catch (error) {
    throw new Error(error instanceof Error ? `音频生成失败：${error.message}` : "音频生成失败");
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

function audioBufferToMonoWav(audioBuffer: AudioBuffer) {
  const samples = mixToMono(audioBuffer);
  const bytesPerSample = 2;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = headerSize;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function mixToMono(audioBuffer: AudioBuffer) {
  const mixed = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      mixed[index] += data[index] / audioBuffer.numberOfChannels;
    }
  }
  return mixed;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function buildAssistantMessage(step: UploadStep) {
  return {
    idle: "先上传课堂视频。我会同步建立课堂记录，并准备后续转写和分析需要的材料。",
    creating: "正在创建课堂记录和上传任务。",
    uploading: "正在保存课堂视频，并提取课堂声音。",
    completed: "上传已完成，下一步可以生成课堂原文并进行分段。",
    failed: "上传失败，请根据提示检查网络或重新选择文件。"
  }[step];
}

function buildChatReply(message: string, context: {
  evidenceCount: number;
  lessonTextCount: number;
  reportCount: number;
  step: UploadStep;
  workflowSummary: string;
}) {
  const normalized = message.toLowerCase();
  if (normalized.includes("证据") || normalized.includes("evidence")) {
    return context.evidenceCount
      ? `当前有 ${context.evidenceCount} 张候选证据。建议先看带有明确时间段和课堂原话的证据，再决定接受、驳回或补充上下文。`
      : "现在还没有候选证据。等转写和课堂分段完成后，处理卡片会推进到教学证据生成。";
  }
  if (normalized.includes("报告") || normalized.includes("report")) {
    return context.reportCount
      ? "已经有报告草稿。你可以让我帮你检查结构、补强证据链，或把语言改得更适合教研复盘。"
      : "报告还没生成。建议先完成证据审核，再生成报告，这样报告会更贴近课堂事实。";
  }
  if (normalized.includes("进度") || normalized.includes("状态") || normalized.includes("处理")) {
    return `当前状态：${context.workflowSummary}。课堂记录已有 ${context.lessonTextCount} 段，上传状态是 ${buildAssistantMessage(context.step)}`;
  }
  if (normalized.includes("转写") || normalized.includes("字幕") || normalized.includes("transcript")) {
    return context.lessonTextCount
      ? `当前已经读取到 ${context.lessonTextCount} 段课堂记录。你可以校订当前片段，再继续生成证据。`
      : "现在还没有课堂记录。请先确认视频上传和课堂声音准备完成，再继续生成原文。";
  }
  return "收到。我会结合当前课堂的上传状态、转写、证据和报告来协助你。现在这个对话框先提供本地上下文回复，后续可以接入真正的 AI 对话服务。";
}

function WorkflowStepList({
  steps,
  task,
  workflowAction,
  onRetry
}: {
  steps: WorkflowStepItem[];
  task: WorkflowStatusResponse["task"];
  workflowAction?: string | null;
  onRetry?: (stepKey: string) => void;
}) {
  if (!steps.length) {
    return <span>还没有处理任务。已有视频时可以点击“开始处理”。</span>;
  }
  return (
    <ol className="workflow-step-list">
      {steps.map((step) => {
        const displayStep = getDisplayWorkflowStep(step, task);
        const canRetryStep = Boolean(onRetry && !["completed", "skipped"].includes(displayStep.status));
        const actionKey = `retry-${step.stepKey}`;
        const progress = getWorkflowStepProgress(displayStep);
        return (
          <li className={`workflow-step ${displayStep.status}`} key={step.stepKey}>
            <span>{step.label || step.stepKey}</span>
            <b>{formatWorkflowStepStatus(displayStep.status, progress)}</b>
            {formatWorkflowStepDuration(displayStep) ? (
              <em>{formatWorkflowStepDuration(displayStep)}</em>
            ) : null}
            {canRetryStep ? (
              <button
                className="ghost-button workflow-step-action"
                disabled={workflowAction === actionKey}
                onClick={() => onRetry?.(step.stepKey)}
                type="button"
              >
                {workflowAction === actionKey ? "重试中" : "重试"}
              </button>
            ) : null}
            <progress aria-label={`${step.label || step.stepKey}进度`} max={100} value={progress} />
            {step.errorMessage ? <small>{step.errorMessage}</small> : null}
          </li>
        );
      })}
    </ol>
  );
}

function getDisplayWorkflowStep(step: WorkflowStepItem, task: WorkflowStatusResponse["task"]): WorkflowStepItem {
  if (!task || task.currentStep !== step.stepKey) return step;
  if (step.status === "completed" || step.status === "skipped") return step;
  if (task.status === "queued" || task.status === "running") {
    const currentStepProgress = step.progress > 0 ? step.progress : 25;
    return {
      ...step,
      status: "running",
      progress: currentStepProgress
    };
  }
  if (task.status === "failed") {
    return {
      ...step,
      status: "failed",
      progress: Math.max(step.progress || 0, task.progress || 0),
      errorMessage: step.errorMessage || task.errorMessage
    };
  }
  if (task.status === "completed" && step.stepKey === "export_report") {
    return { ...step, status: "completed", progress: 100 };
  }
  return step;
}

function formatWorkflowSummary(status: WorkflowStatusResponse | null) {
  if (!status?.task) return "等待上传";
  if (status.task.errorMessage) return "处理失败";
  if (status.task.status === "waiting_for_human" && status.task.currentStep === "build_sections") {
    return "等待确认校订完成";
  }
  return `${formatWorkflowStepStatus(status.task.status, status.task.progress || 0)} · ${status.task.currentStep || "未开始"}`;
}

function getProgressStageIndex(input: { uploadStep: UploadStep; workflowStatus: WorkflowStatusResponse | null }) {
  const task = input.workflowStatus?.task;
  if (task?.status === "completed") return 5;
  if (task?.currentStep) return workflowStepToProgressStage(task.currentStep);
  if (task?.status === "waiting_for_human") return 4;
  if (input.uploadStep === "completed") return 1;
  if (input.uploadStep === "creating" || input.uploadStep === "uploading") return 0;
  return 0;
}

function workflowStepToProgressStage(stepKey: string) {
  if (["create_lesson", "upload_video", "upload_audio"].includes(stepKey)) return 0;
  if (["probe_media", "submit_asr", "poll_asr"].includes(stepKey)) return 1;
  if (["persist_transcript", "normalize_transcript", "build_sections"].includes(stepKey)) return 2;
  if (["calculate_metrics", "detect_events", "generate_evidence", "validate_evidence"].includes(stepKey)) return 3;
  if (stepKey === "wait_human_review") return 4;
  if (["generate_report", "export_report"].includes(stepKey)) return 5;
  return 0;
}

function getRetryStartStepForStage(stageIndex: number) {
  return {
    0: "upload_video",
    1: "probe_media",
    2: "normalize_transcript",
    3: "calculate_metrics",
    4: "wait_human_review",
    5: "generate_report"
  }[stageIndex] || "probe_media";
}

function getWorkflowStepLabel(stepKey: string, steps: WorkflowStepItem[]) {
  return steps.find((step) => step.stepKey === stepKey)?.label || {
    upload_video: "保存课堂视频",
    probe_media: "检查媒体",
    normalize_transcript: "整理逐字稿",
    calculate_metrics: "计算指标",
    wait_human_review: "等待教师复核",
    generate_report: "生成报告"
  }[stepKey] || stepKey;
}

function buildRetryImpactMessage(stepKey: string) {
  const stageIndex = workflowStepToProgressStage(stepKey);
  if (stageIndex <= 2) {
    return "会作废后续已生成的大段记录、指标、证据和报告，并按当前原文重新生成。";
  }
  if (stageIndex === 3) {
    return "会作废后续已生成的指标、证据和报告，并重新分析当前课堂记录。";
  }
  if (stageIndex === 4) {
    return "会回到证据复核环节，已处理的复核进度可能需要重新确认。";
  }
  return "会作废已有报告草稿，并根据当前证据重新生成报告。";
}

function getWorkflowStepProgress(step: WorkflowStepItem) {
  if (step.status === "completed" || step.status === "skipped") return 100;
  if (step.status === "waiting" || step.status === "queued") return 0;
  return Math.max(0, Math.min(100, Math.round(step.progress || 0)));
}

function formatWorkflowStepStatus(status: string, progress?: number | null) {
  return {
    waiting: "等待",
    queued: "排队中",
    running: "进行中",
    waiting_for_human: "待复核",
    completed: "成功",
    failed: "失败",
    skipped: "跳过",
    cancelled: "已取消"
  }[status] || status;
}

function formatWorkflowStepDuration(step: WorkflowStepItem) {
  if (!step.startedAt) return null;
  const started = new Date(step.startedAt).getTime();
  const finished = step.finishedAt ? new Date(step.finishedAt).getTime() : Date.now();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return null;
  const label = step.finishedAt ? "用时" : "已用";
  return `${label} ${formatDuration(finished - started)}`;
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes} 分 ${remainingSeconds} 秒` : `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} 小时 ${remainingMinutes} 分钟` : `${hours} 小时`;
}

function formatReviewStatus(status?: string | null) {
  return {
    pending_review: "待复核",
    accepted: "已接受",
    edited_and_accepted: "修改后接受",
    rejected: "已驳回",
    needs_more_context: "需更多上下文"
  }[status || ""] || "待复核";
}

function isLessonFormat(value: string): value is LessonFormat {
  return lessonFormatOptions.some((option) => option.value === value);
}

function formatTimeRange(startMs: number, endMs: number) {
  return `${formatTimestamp(startMs)}-${formatTimestamp(endMs)}`;
}

function formatTimestamp(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown) {
  const text = stringValue(value).trim();
  return text || null;
}

function arrayOfStrings(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
