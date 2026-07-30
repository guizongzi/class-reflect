"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type LessonListItem = {
  id: string;
  courseTitle?: string | null;
  lessonTitle?: string | null;
  lessonFormat?: string | null;
  grade?: string | null;
  subject?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  fileName?: string | null;
  uploadStatus?: string | null;
  processingStatus?: string | null;
  processingError?: string | null;
  audioUploadStatus?: string | null;
  workflowStatus?: string | null;
  workflowCurrentStep?: string | null;
  workflowProgress?: number | null;
  workflowError?: string | null;
  transcriptSegmentCount?: number;
  lessonSectionCount?: number;
  evidenceCardCount?: number;
  reportCount?: number;
};

type LessonListResponse = {
  lessons: LessonListItem[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export function LessonLibrary() {
  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadLessons = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (quiet) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/lessons`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "无法读取课堂列表");
      }
      setLessons(Array.isArray((body as LessonListResponse).lessons) ? (body as LessonListResponse).lessons : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法读取课堂列表");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  const hasLessons = lessons.length > 0;

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="topbar-title">
          <strong>AI课堂回放与教学分析</strong>
          <span>课堂视频库</span>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" disabled={isRefreshing} onClick={() => void loadLessons({ quiet: true })} type="button">
            {isRefreshing ? "刷新中" : "刷新状态"}
          </button>
          <Link className="primary-button" href="/lessons/new">新建视频</Link>
        </div>
      </header>
      <section className="library-panel">
        <div className="section-heading">
          <div>
            <h1>已有课堂视频</h1>
            <p>查看课堂视频、原文整理、证据审核和报告状态。</p>
          </div>
          <span>{hasLessons ? `${lessons.length} 节课` : "暂无数据"}</span>
        </div>
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
        <div className="lesson-list">
          {isLoading ? (
            <div className="empty-row">
              <strong>正在读取课堂列表</strong>
              <span>请稍等片刻。</span>
            </div>
          ) : null}
          {!isLoading && !hasLessons ? (
            <div className="empty-row">
              <strong>暂无课堂视频</strong>
              <span>上传第一节课后会显示在这里。</span>
              <Link className="primary-button inline-action" href="/lessons/new">上传新视频</Link>
            </div>
          ) : null}
          {!isLoading && hasLessons ? lessons.map((lesson) => (
            <LessonRow
              deletingId={deletingId}
              key={lesson.id}
              lesson={lesson}
              onDelete={async () => {
                if (!window.confirm("确定删除这节课堂及相关记录吗？")) return;
                setDeletingId(lesson.id);
                setErrorMessage(null);
                try {
                  const response = await fetch(`${API_BASE}/api/lessons/${lesson.id}`, { method: "DELETE" });
                  const body = await response.json().catch(() => null);
                  if (!response.ok) {
                    throw new Error(body?.message || body?.error || "删除课堂失败");
                  }
                  await loadLessons({ quiet: true });
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : "删除课堂失败");
                } finally {
                  setDeletingId(null);
                }
              }}
            />
          )) : null}
        </div>
      </section>
    </main>
  );
}

function LessonRow({ deletingId, lesson, onDelete }: { deletingId: string | null; lesson: LessonListItem; onDelete: () => Promise<void> }) {
  const title = lesson.lessonTitle || "未命名课堂";
  const subtitle = [formatLessonType(lesson.lessonFormat), lesson.grade, lesson.subject, lesson.fileName].filter(Boolean).join(" · ");
  const status = useMemo(() => buildStatus(lesson), [lesson]);
  const isDeleting = deletingId === lesson.id;

  return (
    <article className="lesson-row">
      <Link className="lesson-main" href={`/lessons/${lesson.id}`}>
        <div className="lesson-title-line">
          <strong>{title}</strong>
          <span className={`status-pill ${status.tone}`}>{status.label}</span>
        </div>
        <span>{subtitle || "暂无视频文件"}</span>
        <div className="lesson-metrics">
          <Metric label="上传" value={formatUploadStatus(lesson.uploadStatus)} />
          <Metric label="处理" value={formatProcessingStatus(lesson.workflowStatus || lesson.processingStatus)} />
          <Metric label="转写" value={`${lesson.transcriptSegmentCount || 0} 段`} />
          <Metric label="报告" value={(lesson.reportCount || 0) > 0 ? `${lesson.reportCount} 份` : "未生成"} />
        </div>
        {status.detail ? <small>{status.detail}</small> : null}
      </Link>
      <div className="lesson-actions">
        <span>{formatDate(lesson.updatedAt || lesson.createdAt)}</span>
        <button className="danger-button" disabled={isDeleting} onClick={onDelete} type="button">
          {isDeleting ? "删除中" : "删除"}
        </button>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="metric-chip">
      <b>{label}</b>
      {value}
    </span>
  );
}

function buildStatus(lesson: LessonListItem) {
  const failedMessage = lesson.workflowError || lesson.processingError;
  if (failedMessage || lesson.workflowStatus === "failed" || lesson.processingStatus === "failed") {
    return { label: "处理失败", detail: failedMessage || "请刷新或重试处理。", tone: "danger" };
  }
  if ((lesson.reportCount || 0) > 0) return { label: "报告已生成", detail: null, tone: "success" };
  if ((lesson.transcriptSegmentCount || 0) > 0 || (lesson.lessonSectionCount || 0) > 0) {
    return { label: "可校订", detail: null, tone: "success" };
  }
  if (lesson.workflowStatus === "running" || lesson.processingStatus === "running") {
    return {
      label: "处理中",
      detail: lesson.workflowCurrentStep ? `当前步骤：${lesson.workflowCurrentStep}` : null,
      tone: "active"
    };
  }
  if (lesson.workflowStatus === "queued" || lesson.processingStatus === "queued") {
    return { label: "排队中", detail: null, tone: "active" };
  }
  if (lesson.uploadStatus === "uploaded") return { label: "等待处理", detail: null, tone: "neutral" };
  return { label: "等待上传", detail: null, tone: "neutral" };
}

function formatLessonType(value?: string | null) {
  return {
    offline_classroom_recording: "线下课堂录像",
    live_online_class: "直播网课",
    recorded_online_class: "录播网课"
  }[value || ""] || null;
}

function formatUploadStatus(value?: string | null) {
  return {
    pending: "未完成",
    uploaded: "已上传",
    failed: "失败",
    not_requested: "未请求"
  }[value || ""] || "未上传";
}

function formatProcessingStatus(value?: string | null) {
  return {
    created: "已创建",
    queued: "排队中",
    running: "处理中",
    completed: "已完成",
    failed: "失败"
  }[value || ""] || "未开始";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
