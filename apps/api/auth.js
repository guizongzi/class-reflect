import { config } from "./config.js";

export async function getTeacherId(req) {
  const bearer = req.header("authorization") || "";
  const token = bearer.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token && config.supabase.url && config.supabase.anonKey) {
    const response = await fetch(`${config.supabase.url}/auth/v1/user`, {
      headers: {
        apikey: config.supabase.anonKey,
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw Object.assign(new Error("Supabase 登录状态无效或已过期"), { status: 401 });
    }
    const user = await response.json();
    return user.id;
  }
  return req.header("x-teacher-id") || "demo-teacher";
}

export function assertLessonOwner(lesson, teacherId) {
  if (lesson?.teacher_id && lesson.teacher_id !== teacherId) {
    throw Object.assign(new Error("无权访问该课堂"), { status: 403 });
  }
}
