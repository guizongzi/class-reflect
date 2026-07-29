import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AI课堂回放与教学分析",
  description: "基于视频语音证据的教学复盘工作台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
