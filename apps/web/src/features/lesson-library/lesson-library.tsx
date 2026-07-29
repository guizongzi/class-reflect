import Link from "next/link";

export function LessonLibrary() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <strong>AI课堂回放与教学分析</strong>
          <span>课堂视频库</span>
        </div>
        <Link className="primary-button" href="/lessons/new">上传新视频</Link>
      </header>
      <section className="library-panel">
        <h1>已有课堂视频</h1>
        <div className="lesson-list">
          <div className="empty-row">
            <strong>暂无课堂视频</strong>
            <span>上传第一节课后会显示在这里。</span>
          </div>
        </div>
      </section>
    </main>
  );
}
