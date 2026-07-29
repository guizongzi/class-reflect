export const API_BASE = localStorage.getItem("classReflectApiBase") || "";
export const TEACHER_ID = localStorage.getItem("classReflectTeacherId") || "demo-teacher";

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "x-teacher-id": TEACHER_ID,
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `请求失败 ${response.status}`);
  return data as T;
}

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
};

export function putFile(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("无法连接对象存储上传地址"));
    };
    xhr.onerror = () => reject(new Error("无法连接对象存储上传地址"));
    xhr.send(file);
  });
}

