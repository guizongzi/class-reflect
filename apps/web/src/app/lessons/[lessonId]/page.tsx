import { LessonWorkspaceShell } from "../../../features/lesson-workspace/lesson-workspace-shell";

type Props = {
  params: Promise<{ lessonId: string }>;
};

export default async function LessonPage({ params }: Props) {
  const { lessonId } = await params;
  return <LessonWorkspaceShell lessonId={lessonId} />;
}
