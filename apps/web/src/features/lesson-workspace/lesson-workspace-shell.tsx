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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActiveLessonId(lessonId || "");
  }, [lessonId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
          <h2>课堂记录</h2>
          <textarea
            defaultValue="ASR 完成后，这里显示带时间点的大段课堂记录。教师只需要修改有问题的段落，不需要逐句确认。"
          />
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
          <strong>处理卡片</strong>
          <span>视频上传与音频上传完成后，Worker 进入 ASR → 分段 → 证据 → 复核 → 报告。</span>
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

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
