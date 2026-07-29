"use client";

import Link from "next/link";
import { lessonFormatOptions } from "@class-reflect/shared-types";

type Props = {
  lessonId?: string;
};

export function LessonWorkspaceShell({ lessonId }: Props) {
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
          <div className="video-placeholder">
            <strong>拖入或选择课堂视频</strong>
            <span>视频将直传对象存储，API 只保存对象地址和处理状态。</span>
            <label className="primary-button file-picker-button">
              选择课堂视频
              <input accept="video/*" type="file" />
            </label>
            <small>当前入口已开放，下一步接入 R2 预签名上传和真实进度。</small>
          </div>
        </section>

        <section className="format-panel">
          <h2>选择课堂类型</h2>
          <div className="format-grid">
            {lessonFormatOptions.map((option) => (
              <button className="format-card" key={option.value} type="button">
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
          <p>我会先确认你的复盘目标和课堂类型，再创建上传任务。</p>
          <button className="primary-button" type="button">开始上传链路</button>
        </section>
        <section className="assistant-card muted">
          <strong>处理卡片</strong>
          <span>上传视频 → 抽取音频 → ASR → 分段 → 证据 → 复核 → 报告</span>
        </section>
      </aside>
    </main>
  );
}
