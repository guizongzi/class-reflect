import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, putFile } from "./api/client";
import type { EvidenceCardDto, LessonDetail, LessonListItem, LessonSectionDto, NormalizedSection, WorkflowStepDto } from "./api/types";
import { extractWavFromMediaFile } from "./features/lesson-review/media";
import { FLOW, clock, formatDate, normalizeSection, sectionTextForView, statusLabel, stepStatusName } from "./features/lesson-review/model";
import "../styles.css";

type View = "library" | "workspace";
type RecordView = "zh" | "en" | "both";
type ProcessingStatus = "idle" | "uploading" | "queued" | "running" | "completed" | "failed" | "ready";

function App() {
  const [view, setView] = useState<View>("library");
  const [goal, setGoal] = useState("");
  const [draftGoal, setDraftGoal] = useState("");
  const [library, setLibrary] = useState<LessonListItem[]>([]);
  const [libraryError, setLibraryError] = useState("");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioStatus, setAudioStatus] = useState("idle");
  const [audioError, setAudioError] = useState("");
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>("idle");
  const [error, setError] = useState("");
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepDto[]>([]);
  const [sections, setSections] = useState<NormalizedSection[]>([]);
  const [evidenceCards, setEvidenceCards] = useState<EvidenceCardDto[]>([]);
  const [report, setReport] = useState<{ markdown_content?: string } | null>(null);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [recordView, setRecordView] = useState<RecordView>("zh");
  const [recordText, setRecordText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState("已自动保存");
  const [analysisStatus, setAnalysisStatus] = useState("idle");
  const [analysisError, setAnalysisError] = useState("");
  const [translationStatus, setTranslationStatus] = useState("idle");
  const [translationError, setTranslationError] = useState("");
  const pollTimer = useRef<number | null>(null);

  const section = sections[currentSectionIndex];
  const step = useMemo(() => {
    if (["uploading", "queued", "running", "failed"].includes(processingStatus)) return 2;
    if (report) return 6;
    if (evidenceCards.some((card) => ["已接受", "已修改"].includes(card.review_status || ""))) return 5;
    if (evidenceCards.length) return 4;
    if (sections.length) return 3;
    return 1;
  }, [processingStatus, report, evidenceCards, sections]);

  useEffect(() => {
    void loadLibrary();
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!section) {
      setRecordText("上传视频并完成语音转文字后，这里会生成带时间轴的大段课堂记录。你只需要编辑有问题的段落，不需要逐句确认。");
      return;
    }
    setRecordText(sectionTextForView(section, recordView));
    setDirty(false);
    setSaveStatus(recordView === "zh" ? `${section.reviewStatus} · 可整段编辑后保存` : "译文视图暂不直接编辑");
  }, [section?.id, recordView]);

  async function loadLibrary() {
    try {
      const data = await api<{ lessons: LessonListItem[] }>("/api/lessons");
      setLibrary(data.lessons || []);
      setLibraryError("");
    } catch (requestError) {
      setLibraryError(requestError instanceof Error ? requestError.message : "无法读取视频库");
    }
  }

  async function openLesson(id: string) {
    const lesson = await api<LessonDetail>(`/api/lessons/${id}`);
    setLessonId(id);
    setVideoId(lesson.video?.id || null);
    setFileName(lesson.video?.file_name || "");
    setProcessingStatus(lesson.lesson?.status === "ready" ? "ready" : (lesson.video?.processing_status as ProcessingStatus) || "idle");
    setVideoUrl(lesson.playback_url || null);
    setSections((lesson.sections || []).map((item) => normalizeSection(item, lesson.transcript_segments || [])));
    setEvidenceCards(lesson.evidence_cards || []);
    setCurrentSectionIndex(0);
    setView("workspace");
  }

  async function uploadVideo(file: File) {
    try {
      setView("workspace");
      setFileName(file.name);
      setVideoUrl(URL.createObjectURL(file));
      setProcessingStatus("uploading");
      setError("");
      setUploadProgress(0);
      setAudioProgress(0);
      setAudioStatus("preparing");

      const lesson = await api<{ id: string }>("/api/lessons", {
        method: "POST",
        body: { lesson_title: goal || "课堂视频复盘", course_title: "课堂复盘" }
      });
      setLessonId(lesson.id);

      const uploadInfo = await api<{ video_id: string; upload_url: string; headers?: Record<string, string> }>(
        `/api/lessons/${lesson.id}/videos/upload-url`,
        {
          method: "POST",
          body: { file_name: file.name, file_size: file.size, mime_type: file.type || "application/octet-stream" }
        }
      );
      setVideoId(uploadInfo.video_id);

      await Promise.all([
        putFile(uploadInfo.upload_url, file, uploadInfo.headers?.["Content-Type"] || file.type || "application/octet-stream", setUploadProgress),
        uploadAudio(uploadInfo.video_id, file)
      ]);

      await api(`/api/videos/${uploadInfo.video_id}/complete-upload`, { method: "POST" });
      setProcessingStatus("queued");
      pollStatus(lesson.id);
    } catch (requestError) {
      setProcessingStatus("failed");
      setError(requestError instanceof Error ? requestError.message : "上传失败");
    }
  }

  async function uploadAudio(nextVideoId: string, file: File) {
    try {
      setAudioStatus("extracting");
      const audioBlob = await extractWavFromMediaFile(file);
      const uploadInfo = await api<{ upload_url: string; headers?: Record<string, string> }>(`/api/videos/${nextVideoId}/audio-upload-url`, {
        method: "POST",
        body: { mime_type: "audio/wav" }
      });
      setAudioStatus("uploading");
      await putFile(uploadInfo.upload_url, audioBlob, uploadInfo.headers?.["Content-Type"] || "audio/wav", setAudioProgress);
      await api(`/api/videos/${nextVideoId}/complete-audio-upload`, { method: "POST" });
      setAudioStatus("uploaded");
    } catch (requestError) {
      setAudioStatus("fallback");
      setAudioError(requestError instanceof Error ? requestError.message : "浏览器无法生成音频，worker 会从视频抽取");
    }
  }

  async function pollStatus(id = lessonId) {
    if (!id) return;
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
    try {
      const status = await api<{ task?: { status?: ProcessingStatus; error_message?: string }; steps?: WorkflowStepDto[] }>(`/api/lessons/${id}/status`);
      const nextStatus = status.task?.status || "idle";
      setProcessingStatus(nextStatus);
      setError(status.task?.error_message || "");
      setWorkflowSteps(status.steps || []);
      if (nextStatus === "completed") {
        await openLesson(id);
        setProcessingStatus("ready");
        void loadLibrary();
      } else if (nextStatus === "queued" || nextStatus === "running") {
        pollTimer.current = window.setTimeout(() => void pollStatus(id), 2500);
      }
    } catch (requestError) {
      setProcessingStatus("failed");
      setError(requestError instanceof Error ? requestError.message : "无法读取处理状态");
    }
  }

  async function saveCurrentSection(force = false) {
    if (!section?.id) return;
    if (recordView !== "zh") {
      if (force) setSaveStatus("译文视图仅供查看，请回到原文记录后编辑保存");
      return;
    }
    if (!dirty && !force) return;
    try {
      setSaveStatus("正在保存...");
      const saved = await api<LessonSectionDto>(`/api/sections/${section.id}`, {
        method: "PATCH",
        body: { edited_summary_text: recordText, review_status: "已校订" }
      });
      setSections((items) => items.map((item) => item.id === section.id ? normalizeSection(saved, []) : item));
      setDirty(false);
      setSaveStatus("已保存到后端");
    } catch (requestError) {
      setSaveStatus(`保存失败：${requestError instanceof Error ? requestError.message : "未知错误"}`);
    }
  }

  async function translateLesson() {
    if (!lessonId) return;
    try {
      setTranslationStatus("running");
      setTranslationError("");
      await api(`/api/lessons/${lessonId}/translate`, { method: "POST", body: { force: false } });
      await openLesson(lessonId);
      setTranslationStatus("completed");
      setRecordView("both");
    } catch (requestError) {
      setTranslationStatus("failed");
      setTranslationError(requestError instanceof Error ? requestError.message : "翻译失败");
    }
  }

  async function runAnalysis() {
    if (!lessonId) return;
    try {
      setAnalysisStatus("running");
      setAnalysisError("");
      const result = await api<{ evidence_cards: EvidenceCardDto[] }>(`/api/lessons/${lessonId}/analyze`, { method: "POST", body: { goal } });
      setEvidenceCards(result.evidence_cards || []);
      setAnalysisStatus("completed");
    } catch (requestError) {
      setAnalysisStatus("failed");
      setAnalysisError(requestError instanceof Error ? requestError.message : "AI 分析失败");
    }
  }

  async function reviewEvidence(cardId: string, reviewStatus: string) {
    const saved = await api<EvidenceCardDto>(`/api/evidence-cards/${cardId}/review`, { method: "PATCH", body: { review_status: reviewStatus } });
    setEvidenceCards((items) => items.map((item) => item.id === cardId ? saved : item));
  }

  async function generateReport() {
    if (!lessonId) return;
    const nextReport = await api<{ markdown_content?: string }>(`/api/lessons/${lessonId}/reports`, { method: "POST" });
    setReport(nextReport);
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-area">
          <div className="brand-mark">AI</div>
          <div>
            <h1>AI课堂回放与教学分析</h1>
            <p>React + Python FastAPI 目标架构</p>
          </div>
        </div>
        <div className="top-actions">
          <button className="light-button" type="button" onClick={() => setView("library")}>视频库</button>
          <button className="light-button" type="button" onClick={() => setView("workspace")}>新建分析</button>
          <div className="teacher-avatar">张</div>
          <span>张老师</span>
        </div>
      </header>

      {view === "library" ? (
        <main className="library-view">
          <section className="library-hero">
            <div>
              <p className="section-kicker">课堂视频库</p>
              <h2>已有课堂视频</h2>
              <span>查看已上传的视频、处理状态和转写结果；也可以删除不需要的课堂记录。</span>
            </div>
            <button className="primary-button" type="button" onClick={() => setView("workspace")}>上传新视频</button>
          </section>
          <section className="library-list">
            {libraryError && <div className="empty-library">读取失败：{libraryError}</div>}
            {!libraryError && !library.length && <div className="empty-library">还没有课堂视频。点击“上传新视频”开始第一条复盘。</div>}
            {library.map((lesson) => (
              <article className="lesson-row" key={lesson.id}>
                <div>
                  <strong>{lesson.lesson_title || "课堂视频复盘"}</strong>
                  <p>{lesson.file_name || "未上传视频"}</p>
                  <span>{formatDate(lesson.updated_at || lesson.created_at)} · {lesson.segment_count || 0} 条逐字稿 · {lesson.section_count || 0} 个课堂片段</span>
                </div>
                <div className="lesson-status">
                  <span className="status-pill">{statusLabel(lesson)}</span>
                  <button className="light-button" type="button" onClick={() => void openLesson(lesson.id)}>打开</button>
                </div>
              </article>
            ))}
          </section>
        </main>
      ) : (
        <main className="main-layout">
          <section className="evidence-workspace">
            <div className="video-header">
              <div>
                <p className="section-kicker">课堂视频（语音转文字分析）</p>
                <h2>上传课堂视频后开始复盘</h2>
              </div>
              <label className="upload-button">
                <input type="file" accept="video/*" onChange={(event) => event.target.files?.[0] && void uploadVideo(event.target.files[0])} />
                <span>{fileName || "上传课堂视频"}</span>
              </label>
            </div>
            <div className="video-stage">
              {!videoUrl && (
                <div className="upload-empty">
                  <div className="upload-icon">↑</div>
                  <strong>拖入或选择课堂视频</strong>
                  <span>第一版只基于音频转写与课堂原文分析，不做视频 OCR 或画面框选。</span>
                </div>
              )}
              {videoUrl && <video src={videoUrl} controls playsInline />}
              <div className="time-evidence-chip">{section ? `语音证据 ${clock(section.startMs)} - ${clock(section.endMs)}` : `上传进度 ${uploadProgress}%`}</div>
            </div>
            <div className="segment-rail">
              <button className="rail-arrow" type="button" onClick={() => setCurrentSectionIndex(Math.max(0, currentSectionIndex - 1))}>‹</button>
              <div className="segment-tabs">
                {sections.length ? sections.map((item, index) => (
                  <button className={`segment-tab ${index === currentSectionIndex ? "active" : ""}`} type="button" key={item.id} onClick={() => setCurrentSectionIndex(index)}>
                    <span>{clock(item.startMs)}-{clock(item.endMs)}</span>
                    <strong>{item.title}</strong>
                  </button>
                )) : <button className="segment-tab active" type="button"><span>等待转写</span><strong>上传后生成课堂记录</strong></button>}
              </div>
              <button className="rail-arrow" type="button" onClick={() => setCurrentSectionIndex(Math.min(sections.length - 1, currentSectionIndex + 1))}>›</button>
            </div>
            <section className="record-card">
              <div className="record-header">
                <div>
                  <p className="section-kicker">课堂记录</p>
                  <h2>大段编辑，无需逐句确认</h2>
                </div>
                <div className="record-tabs">
                  {[
                    ["zh", "原文记录"],
                    ["en", "中文译文"],
                    ["both", "原文译文"]
                  ].map(([key, label]) => (
                    <button className={`record-tab ${recordView === key ? "active" : ""}`} type="button" key={key} onClick={() => setRecordView(key as RecordView)}>{label}</button>
                  ))}
                </div>
              </div>
              <textarea value={recordText} readOnly={recordView !== "zh"} disabled={!section} spellCheck={false} onBlur={() => void saveCurrentSection()} onChange={(event) => {
                setRecordText(event.target.value);
                setDirty(true);
                setSaveStatus("有未保存修改");
              }} />
              <div className="record-footer">
                <span>{saveStatus}</span>
                <div className="record-actions">
                  <button className="primary-button" type="button" onClick={() => void saveCurrentSection(true)}>保存记录</button>
                  <button className="light-button" type="button">标记重点</button>
                  <button className="light-button" type="button">标记困惑</button>
                </div>
              </div>
            </section>
          </section>
          <aside className="assistant-panel">
            <div className="progress-card">
              <h2>AI任务助手</h2>
              <ol className="flow-steps">
                {FLOW.map((label, index) => {
                  const number = index + 1;
                  return <li className={number < step ? "done" : number === step ? "active" : ""} key={label}><span>{number < step ? "✓" : number}</span>{label}</li>;
                })}
              </ol>
            </div>
            <div className="conversation">
              <form className="assistant-input embedded" onSubmit={(event) => {
                event.preventDefault();
                setGoal(draftGoal.trim());
                setDraftGoal("");
              }}>
                <input value={draftGoal} onChange={(event) => setDraftGoal(event.target.value)} placeholder="告诉 Agent 你想复盘什么..." />
                <button type="submit" aria-label="发送">➜</button>
              </form>
              {goal ? <div className="message user"><p>{goal}</p></div> : <div className="message ai"><strong>Agent</strong><p>你想重点复盘什么问题？例如：提问后学生思考时间是否足够。</p></div>}
              <ProcessCard title="处理过程" value={processingLabel(processingStatus, uploadProgress, audioStatus, audioProgress, audioError)} note="上传、对象存储、音频抽取、ASR 和写库都是后端真实状态。" steps={workflowSteps} />
              {sections.length > 0 && <ProcessCard title="中文翻译" value={translationStatus === "running" ? "正在生成中文翻译" : "按需生成"} note="英文或双语课堂需要时再生成；中文课可以不翻译。" action={<button className="primary-button inline-action" type="button" onClick={() => void translateLesson()}>生成中文翻译</button>} error={translationError} />}
              {sections.length > 0 && !evidenceCards.length && <ProcessCard title="基础记录已就绪" value={analysisStatus === "running" ? "正在运行多 Agent 分析" : "尚未运行真实 AI 教学分析"} note="将从已校订大段记录中拆出关键证据段落。" action={<button className="primary-button inline-action" type="button" onClick={() => void runAnalysis()}>开始多 Agent 分析</button>} error={analysisError} />}
              {evidenceCards.map((card) => <EvidenceCard key={card.id} card={card} onReview={reviewEvidence} />)}
              {evidenceCards.length > 0 && <ProcessCard title="生成教学报告" value={`${evidenceCards.filter((card) => ["已接受", "已修改"].includes(card.review_status || "")).length} 条已确认`} note="只有已接受/已修改的内容会进入报告。" action={<button className="primary-button inline-action" type="button" onClick={() => void generateReport()}>生成报告</button>} />}
              {report?.markdown_content && <pre className="report-preview">{report.markdown_content}</pre>}
              {error && <ProcessCard title="处理失败" value={error} note="可以从当前失败步骤重试，不需要重新上传视频。" />}
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}

function ProcessCard(props: { title: string; value: string; note: string; action?: React.ReactNode; error?: string; steps?: WorkflowStepDto[] }) {
  return (
    <div className="process-card">
      <strong>{props.title}</strong>
      <p>{props.value}</p>
      <div className="process-note">{props.note}</div>
      {props.steps?.length ? <ol className="backend-steps">{props.steps.map((step) => <li className={step.status || ""} key={step.key}><b>{step.label || step.key}</b><em>{step.status || "等待"}</em>{step.error_message && <small>{step.error_message}</small>}</li>)}</ol> : null}
      {props.action}
      {props.error && <small className="error-text">{props.error}</small>}
    </div>
  );
}

function EvidenceCard({ card, onReview }: { card: EvidenceCardDto; onReview: (cardId: string, reviewStatus: string) => Promise<void> }) {
  return (
    <div className="evidence-card">
      <div className="evidence-card-head">
        <strong>{card.evidence_type || "证据"}</strong>
        <span>{card.review_status || "待复核"}</span>
      </div>
      <p>{card.edited_conclusion || card.conclusion}</p>
      <blockquote>{card.quote_text || "暂无原文引用"}</blockquote>
      <small>{clock(card.start_ms)}-{clock(card.end_ms)} · {card.confidence_label || "需要复核"}</small>
      {card.suggestion && <div className="suggestion">{card.suggestion}</div>}
      <div className="card-actions">
        <button className="light-button" type="button" onClick={() => void onReview(card.id, "已接受")}>接受</button>
        <button className="light-button" type="button" onClick={() => void onReview(card.id, "已修改")}>修改后接受</button>
        <button className="danger-button" type="button" onClick={() => void onReview(card.id, "已驳回")}>驳回</button>
      </div>
    </div>
  );
}

function processingLabel(status: ProcessingStatus, uploadProgress: number, audioStatus: string, audioProgress: number, audioError: string): string {
  const audioLabel = {
    idle: "",
    preparing: "；音频通道准备中",
    extracting: "；正在本地生成 ASR 音频",
    uploading: `；音频上传 ${audioProgress}%`,
    uploaded: "；音频已上传，可优先转写",
    fallback: `；音频通道回退：${audioError}`
  }[audioStatus] || "";
  return {
    idle: "等待上传",
    uploading: `视频上传中 ${uploadProgress}%${audioLabel}`,
    queued: "已入队，等待处理",
    running: "正在抽音频、转写并写入数据库",
    completed: "处理完成",
    ready: "处理完成",
    failed: "处理失败"
  }[status] || "等待上传";
}

createRoot(document.getElementById("root")!).render(<App />);
