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
};

type LessonDetailResponse = {
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
  title?: string;
  fact?: string;
  interpretation?: string;
  suggestion?: string;
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const defaultLessonFormat: LessonFormat = "offline_classroom_recording";

export function LessonWorkspaceShell({ lessonId }: Props) {
  const [activeLessonId, setActiveLessonId] = useState(lessonId || "");
  const [lessonFormat, setLessonFormat] = useState<LessonFormat>(defaultLessonFormat);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<UploadStep>("idle");
  const [videoProgress, setVideoProgress] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("请选择或拖入课堂视频。");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusResponse | null>(null);
  const [isWorkflowRefreshing, setIsWorkflowRefreshing] = useState(false);
  const [lessonTexts, setLessonTexts] = useState<LessonTextItem[]>([]);
  const [editingTextById, setEditingTextById] = useState<Record<string, string>>({});
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [evidenceCards, setEvidenceCards] = useState<EvidenceCardItem[]>([]);
  const [reviewingEvidenceId, setReviewingEvidenceId] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportDraft, setReportDraft] = useState("");
  const [savingReport, setSavingReport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActiveLessonId(lessonId || "");
  }, [lessonId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!activeLessonId) return;
    let cancelled = false;
    async function loadLessonDetail() {
      try {
        const detail = await getJson<LessonDetailResponse>(`/api/lessons/${activeLessonId}`);
        if (!cancelled) {
          const textItems = buildLessonTextItems(detail);
          setLessonTexts(textItems);
          setEditingTextById(Object.fromEntries(textItems.map((item) => [item.id, item.originalText])));
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
  }, [activeLessonId]);

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

  async function saveSection(item: LessonTextItem) {
    if (!activeLessonId || item.targetType !== "section") return;
    const editedSummaryText = editingTextById[item.id] || item.originalText;
    setSavingSectionId(item.id);
    setTranslationError(null);
    try {
      const result = await patchJson<{ section?: { summaryText?: string } }>(`/api/lessons/${activeLessonId}/transcripts/sections/${item.id}`, {
        editedSummaryText
      });
      const savedText = result.section?.summaryText || editedSummaryText;
      setLessonTexts((items) => items.map((current) => current.id === item.id ? { ...current, originalText: savedText } : current));
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
      const result = await getJson<{ evidenceCards: EvidenceCardItem[] }>(`/api/lessons/${activeLessonId}/evidence`);
      setEvidenceCards(result.evidenceCards || []);
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

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setErrorMessage("请选择课堂视频文件。");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFileName(file.name);
    setVideoProgress(0);
    setAudioProgress(0);
    setErrorMessage(null);
    setStep("creating");
    setStatusMessage("正在创建课堂记录和上传任务。");

    try {
      const ensuredLessonId = activeLessonId || await createLessonFromFile(file, lessonFormat);
      setActiveLessonId(ensuredLessonId);
      if (!lessonId) window.history.replaceState(null, "", `/lessons/${ensuredLessonId}`);

      const videoUpload = await postJson<UploadUrlResponse>(`/api/lessons/${ensuredLessonId}/videos/upload-url`, {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream"
      });

      setStep("uploading");
      setStatusMessage("正在并行上传原始视频，并在浏览器中生成音频。");

      const videoPipeline = uploadBlobWithProgress({
        url: videoUpload.uploadUrl,
        blob: file,
        headers: videoUpload.headers,
        onProgress: setVideoProgress
      }).then(() => postJson(`/api/lessons/videos/${videoUpload.videoId}/complete-upload`, {}));

      const audioPipeline = extractAudioWav(file)
        .then(async (audioBlob) => {
          const audioUpload = await postJson<UploadUrlResponse>(`/api/lessons/videos/${videoUpload.videoId}/audio-upload-url`, {
            mimeType: "audio/wav"
          });
          await uploadBlobWithProgress({
            url: audioUpload.uploadUrl,
            blob: audioBlob,
            headers: audioUpload.headers,
            onProgress: setAudioProgress
          });
          await postJson(`/api/lessons/videos/${videoUpload.videoId}/complete-audio-upload`, {});
        });

      await Promise.all([videoPipeline, audioPipeline]);
      setStep("completed");
      setStatusMessage("视频和音频都已上传到对象存储，后续 Worker 可以直接读取音频进入转写。");
      const latestStatus = await getJson<WorkflowStatusResponse>(`/api/lessons/${ensuredLessonId}/status`);
      setWorkflowStatus(latestStatus);
    } catch (error) {
      setStep("failed");
      setErrorMessage(error instanceof Error ? error.message : "上传失败");
      setStatusMessage("上传链路未完成，请检查配置后重试。");
    }
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-main">
        <header className="topbar">
          <div>
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
              if (file) void handleFile(file);
            }}
          >
            {previewUrl ? (
              <video className="video-preview" controls src={previewUrl} />
            ) : (
              <div className="video-placeholder">
                <strong>拖入或选择课堂视频</strong>
                <span>视频会进入 R2，页面同时提取音频并上传，后端只记录对象地址和状态。</span>
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
                  if (file) void handleFile(file);
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

        <section className="format-panel">
          <h2>选择课堂类型</h2>
          <div className="format-grid">
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
        </section>

        <section className="transcript-panel">
          <div className="panel-heading-row">
            <h2>课堂记录</h2>
            <span>{lessonTexts.length ? `${lessonTexts.length} 段` : "等待转写"}</span>
          </div>
          {translationError ? <div className="error-banner compact">{translationError}</div> : null}
          <div className="transcript-list">
            {lessonTexts.length ? lessonTexts.map((item) => (
              <article className="transcript-item" key={item.id}>
                <button
                  className="transcript-body"
                  onClick={() => void translateTextItem(item)}
                  type="button"
                >
                  <div>
                    <strong>{item.title}</strong>
                    <span>{formatTimeRange(item.startMs, item.endMs)}</span>
                  </div>
                  <p>{item.originalText}</p>
                  {item.translatedText ? <em>{item.translatedText}</em> : null}
                </button>
                <div className="transcript-actions">
                  {item.targetType === "section" ? (
                    <textarea
                      aria-label="校订课堂记录"
                      value={editingTextById[item.id] ?? item.originalText}
                      onChange={(event) => setEditingTextById((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                    />
                  ) : null}
                  <div>
                    {item.targetType === "section" ? (
                      <button
                        className="ghost-button compact-button"
                        disabled={savingSectionId === item.id}
                        onClick={() => void saveSection(item)}
                        type="button"
                      >
                        {savingSectionId === item.id ? "保存中" : "保存校订"}
                      </button>
                    ) : null}
                    <button
                      className="ghost-button compact-button"
                      disabled={translatingId === item.id}
                      onClick={() => void translateTextItem(item, Boolean(item.translatedText))}
                      type="button"
                    >
                      {translatingId === item.id ? "翻译中" : item.translatedText ? "重新翻译" : "英译中"}
                    </button>
                  </div>
                </div>
              </article>
            )) : (
              <div className="empty-row">
                <strong>暂无课堂记录</strong>
                <span>ASR 写入逐字稿或大段记录后，这里可以点击段落触发翻译。</span>
              </div>
            )}
          </div>
        </section>
      </section>

      <aside className="assistant-panel">
        <div className="progress-line">
          {["对话发起", "处理过程", "校订原文", "核对证据", "人工复核", "生成报告"].map((step, index) => (
            <span key={step} className={index === 0 ? "active" : ""}>{step}</span>
          ))}
        </div>
        <section className="assistant-card">
          <h2>AI 任务助手</h2>
          <p>{buildAssistantMessage(step)}</p>
          <button className="primary-button" onClick={() => fileInputRef.current?.click()} type="button">
            上传课堂视频
          </button>
        </section>
        <section className="assistant-card muted">
          <div className="assistant-card-title">
            <strong>处理卡片</strong>
            <span>{isWorkflowRefreshing ? "刷新中" : formatWorkflowSummary(workflowStatus)}</span>
          </div>
          <WorkflowStepList steps={workflowStatus?.steps || []} />
        </section>
        <section className="assistant-card muted">
          <div className="assistant-card-title">
            <strong>证据审核</strong>
            <span>{evidenceCards.length ? `${evidenceCards.length} 张` : "等待生成"}</span>
          </div>
          <div className="evidence-list">
            {evidenceCards.length ? evidenceCards.map((card) => (
              <article className="evidence-card" key={card.id}>
                <div>
                  <strong>{card.title || card.category || "教学证据"}</strong>
                  <span>{formatTimeRange(card.startMs || 0, card.endMs || 0)} · {formatReviewStatus(card.reviewStatus)}</span>
                </div>
                <p>{card.fact || card.quote}</p>
                {card.interpretation ? <small>{card.interpretation}</small> : null}
                {card.suggestion ? <em>{card.suggestion}</em> : null}
                <div className="evidence-actions">
                  <button className="ghost-button compact-button" disabled={reviewingEvidenceId === card.id} onClick={() => void reviewEvidence(card, "accepted")} type="button">接受</button>
                  <button className="ghost-button compact-button" disabled={reviewingEvidenceId === card.id} onClick={() => void reviewEvidence(card, "needs_more_context")} type="button">需更多上下文</button>
                  <button className="danger-button compact-button" disabled={reviewingEvidenceId === card.id} onClick={() => void reviewEvidence(card, "rejected")} type="button">驳回</button>
                </div>
              </article>
            )) : <span>Worker 生成候选证据后会显示在这里。</span>}
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

function buildLessonTextItems(detail: LessonDetailResponse): LessonTextItem[] {
  const sections = Array.isArray(detail.sections) ? detail.sections : [];
  if (sections.length) {
    return sections.map((section, index): LessonTextItem => ({
      id: stringValue(section.id),
      targetType: "section",
      startMs: numberValue(section.start_ms ?? section.startMs),
      endMs: numberValue(section.end_ms ?? section.endMs),
      title: stringValue(section.title) || `课堂片段 ${index + 1}`,
      originalText: stringValue(section.edited_summary_text ?? section.editedSummaryText ?? section.summary_text ?? section.summaryText),
      translatedText: nullableString(section.translated_summary_text ?? section.translatedSummaryText)
    })).filter((item) => item.id && item.originalText);
  }

  const segments = Array.isArray(detail.transcriptSegments) ? detail.transcriptSegments : [];
  return segments.map((segment, index): LessonTextItem => ({
    id: stringValue(segment.id),
    targetType: "segment",
    startMs: numberValue(segment.start_ms ?? segment.startMs),
    endMs: numberValue(segment.end_ms ?? segment.endMs),
    title: stringValue(segment.speaker_label ?? segment.speakerLabel) || `说话片段 ${index + 1}`,
    originalText: stringValue(segment.original_text ?? segment.originalText),
    translatedText: nullableString(segment.translated_text ?? segment.translatedText)
  })).filter((item) => item.id && item.originalText);
}

function normalizeEvidenceCards(value: unknown): EvidenceCardItem[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    const raw = item.raw_json && typeof item.raw_json === "object" ? item.raw_json as Record<string, unknown> : {};
    const conclusion = stringValue(item.edited_conclusion ?? item.conclusion);
    const [fact = conclusion, interpretation = ""] = conclusion.split("\n");
    return {
      id: stringValue(item.id ?? raw.id),
      category: stringValue(raw.category ?? item.evidence_type),
      title: stringValue(raw.title ?? item.evidence_type),
      fact: stringValue(raw.fact ?? fact),
      interpretation: stringValue(raw.interpretation ?? interpretation),
      suggestion: stringValue(item.suggestion ?? raw.suggestion),
      startMs: numberValue(item.start_ms ?? raw.startMs),
      endMs: numberValue(item.end_ms ?? raw.endMs),
      quote: stringValue(item.quote_text ?? raw.quote),
      confidence: stringValue(item.confidence_label ?? raw.confidence),
      reviewStatus: stringValue(item.review_status ?? raw.reviewStatus),
      uncertaintyNote: nullableString(raw.uncertaintyNote)
    };
  }).filter((item) => item.id);
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
      reject(new Error(`对象存储上传失败：HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("无法连接对象存储上传地址，请检查 R2 CORS 或网络。"));
    xhr.send(input.blob);
  });
}

async function extractAudioWav(file: File) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("当前浏览器不支持前端音频提取。");
  }

  const audioContext = new AudioContextClass();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    return audioBufferToMonoWav(decoded);
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
    idle: "先上传课堂视频。我会同步建立课堂记录，并把原始视频和提取出的音频分别保存到对象存储。",
    creating: "正在创建课堂记录和上传任务。",
    uploading: "正在处理上传：原始视频直传 R2，音频在浏览器中生成后并行上传。",
    completed: "上传链路已完成，下一步可以进入转写和课堂分段。",
    failed: "上传链路失败，请根据错误提示修正配置或重试。"
  }[step];
}

function WorkflowStepList({ steps }: { steps: WorkflowStepItem[] }) {
  if (!steps.length) {
    return <span>上传视频后，这里会显示可追踪的后台处理步骤。</span>;
  }
  return (
    <ol className="workflow-step-list">
      {steps.map((step) => (
        <li className={`workflow-step ${step.status}`} key={step.stepKey}>
          <span>{step.label || step.stepKey}</span>
          <b>{formatWorkflowStepStatus(step.status, step.progress)}</b>
          {step.errorMessage ? <small>{step.errorMessage}</small> : null}
        </li>
      ))}
    </ol>
  );
}

function formatWorkflowSummary(status: WorkflowStatusResponse | null) {
  if (!status?.task) return "等待上传";
  if (status.task.errorMessage) return "处理失败";
  return `${formatWorkflowStepStatus(status.task.status, status.task.progress || 0)} · ${status.task.currentStep || "未开始"}`;
}

function formatWorkflowStepStatus(status: string, progress?: number | null) {
  return {
    waiting: "等待",
    queued: "排队中",
    running: `${Math.max(0, Math.min(100, Math.round(progress || 0)))}%`,
    waiting_for_human: "待复核",
    completed: "完成",
    failed: "失败",
    skipped: "跳过",
    cancelled: "已取消"
  }[status] || status;
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

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
